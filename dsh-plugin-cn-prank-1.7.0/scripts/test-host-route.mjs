/**
 * Exercise the Host half's one piece of real logic: the beat-video route.
 *
 * This exists because the route cannot be checked any other way. It is registered
 * against a live Cordis `webServer`, so the only alternatives are "start a whole
 * Harness" or "restart the author's running one" — and the interesting behaviour
 * (Range parsing, the missing-file path, the method guard) is pure request/response
 * logic that needs neither.
 *
 * The fake context below is deliberately tiny: it implements exactly the four
 * members `apply()` touches, and nothing else. If the plugin starts using a fifth,
 * this test fails loudly rather than silently testing less.
 *
 * Run with `node scripts/test-host-route.mjs` or `npm test`.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const { apply } = await import('../index.js')

/** The one path the Client half asks for; keep in sync with `index.js`. */
const ROUTE = '/dsh-cn-prank/beat.mp4'

/**
 * Build a context just real enough for `apply()`.
 * @returns the captured routes and index-injection rows.
 */
function mount() {
  const routes = []
  const rows = []
  const log = []
  const scope = {
    logger: () => ({ info: (line) => log.push(line), warn: (line) => log.push(line) }),
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    on(name, listener) {
      if (name === 'webserver/index-inject') rows.push(listener)
      return () => {}
    },
    inject(_dependencies, callback) {
      return callback({
        ...scope,
        webServer: {
          register(route) {
            routes.push(route)
            return () => {}
          },
        },
      })
    },
  }
  apply(scope, {})
  return { routes, rows, log }
}

/**
 * Capture one response without a socket.
 * @returns `{ status, headers, body }` after the handler settles.
 */
function exchange(handler, request) {
  const captured = { status: 0, headers: {}, body: undefined }
  const response = {
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(body) {
      captured.body = body
    },
  }
  handler(request, response)
  return captured
}

const { routes, rows } = mount()

// ① The row that hands settings to the browser.
assert.equal(rows.length, 1, 'apply() must register exactly one index-injection row')
const table = []
rows[0](table)
assert.equal(table.length, 1, 'the row must push exactly one entry')
assert.equal(table[0].kind, 'global')
assert.equal(table[0].name, '__DSH_CN_PRANK__')
assert.ok(Array.isArray(table[0].value.beatVideoUrls), 'the published config must carry beatVideoUrls')
assert.ok(
  table[0].value.beatVideoUrls.includes(ROUTE),
  'the published URL list must include the relative route',
)

// ② The route itself. It is not the only one apply() registers (Claude体验模式 brings
//    its own), so this looks it up by path rather than by position.
const registered = routes.find((route) => route.path === ROUTE)
assert.ok(registered !== undefined, `apply() must register ${ROUTE}`)
assert.equal(registered.kind, 'exact')
const handler = registered.handler

// ③ A method that is neither GET nor HEAD is refused before any file is read.
const rejected = exchange(handler, { method: 'POST', headers: {} })
assert.equal(rejected.status, 405)
assert.equal(rejected.headers.Allow, 'GET, HEAD')

// ④ The shipped state: no clip installed. 404 with a body the author can read, and
//    crucially not a crash — the Client half turns any error into the fallback.
const installed = existsSync(new URL('../assets/beat.mp4', import.meta.url))
if (!installed) {
  const missing = exchange(handler, { method: 'GET', headers: {} })
  assert.equal(missing.status, 404, 'a missing clip must answer 404 so the client falls back')
  assert.match(String(missing.headers['Content-Type']), /^text\/plain/)
  console.log('test-host-route: ok (no clip installed — 404 fallback verified)')
} else {
  const full = exchange(handler, { method: 'GET', headers: {} })
  assert.equal(full.status, 200)
  assert.equal(full.headers['Content-Type'], 'video/mp4')
  assert.equal(full.headers['Accept-Ranges'], 'bytes')
  assert.equal(full.headers['Access-Control-Allow-Origin'], '*')
  const total = full.body.length
  assert.equal(Number(full.headers['Content-Length']), total)
  assert.ok(total > 0)

  const ranged = exchange(handler, { method: 'GET', headers: { range: 'bytes=0-9' } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers['Content-Range'], `bytes 0-9/${String(total)}`)
  assert.equal(ranged.body.length, 10)

  const suffix = exchange(handler, { method: 'GET', headers: { range: 'bytes=-5' } })
  assert.equal(suffix.status, 206)
  assert.equal(suffix.body.length, 5)

  const openEnded = exchange(handler, { method: 'GET', headers: { range: `bytes=${String(total - 3)}-` } })
  assert.equal(openEnded.status, 206)
  assert.equal(openEnded.body.length, 3)

  // A range past the end is not a 416 in this implementation: it is simply "send
  // everything", which is what a player probing a few bytes actually wants.
  const pastEnd = exchange(handler, { method: 'GET', headers: { range: `bytes=${String(total + 10)}-` } })
  assert.equal(pastEnd.status, 200)

  const head = exchange(handler, { method: 'HEAD', headers: {} })
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined, 'HEAD must not carry a body')

  console.log(`test-host-route: ok (clip present, ${String(total)} bytes — 200/206/405/HEAD verified)`)
}

// ⑤ Guard the wiring the Client half depends on: it reads a *list*, and it must be
//    able to fall back, because "no clip" is the shipped configuration.
const published = table[0].value
assert.equal(published.beatVideo, true)
assert.ok(published.beatVideoUrls.length >= 1)
