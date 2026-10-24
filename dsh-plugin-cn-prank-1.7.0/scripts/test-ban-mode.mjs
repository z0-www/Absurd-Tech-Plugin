/**
 * Exercise Claude体验模式 end to end against a throwaway directory.
 *
 * The scanner is the only part of this plugin that reads the user's disk, so it is
 * the part most worth pinning down: it must find Chinese in a real file, it must
 * skip the places where Chinese is meaningless (`node_modules`), it must bound how
 * much work one pass may do, and the 30-minute silence must actually clear the hit
 * rather than merely hide it.
 *
 * Two levels, on purpose:
 *
 *   * the route handler, because that is the entry point the browser talks to;
 *   * `scanForChinese` directly, because a route-level "the hit is not X" assertion
 *     is hollow — the scanner returns on its *first* hit, so `notEqual(hit.path, X)`
 *     passes whether X was skipped or merely never reached. The only way to prove a
 *     skip is to give the scanner nothing but the thing that must be skipped.
 *
 * Run with `node scripts/test-ban-mode.mjs` or `npm test`.
 */

import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { apply, scanForChinese } = await import('../index.js')

/** Fixture lives inside the package: the sandbox's temporary area is not writable. */
const FIXTURE = fileURLToPath(new URL('../.ban-fixture/', import.meta.url))
const ROUTE_ROOT = join(FIXTURE, 'route')
const ONLY_SKIPPED = join(FIXTURE, 'only-skipped')
const HUGE_ONLY = join(FIXTURE, 'huge-only')
const MANY_DIRS = join(FIXTURE, 'many-dirs')
const MISSING = join(FIXTURE, 'does-not-exist')

const CHINESE_FILE = join(ROUTE_ROOT, 'notes.md')
const ENGLISH_FILE = join(ROUTE_ROOT, 'readme.txt')
const SKIPPED_LIB = join(ROUTE_ROOT, 'node_modules', 'some-lib', 'README.md')
const BINARY_FILE = join(ROUTE_ROOT, 'blob.png')
const HIDDEN_LIB = join(ONLY_SKIPPED, 'node_modules', 'lib', 'README.md')
const HIDDEN_BINARY = join(ONLY_SKIPPED, 'blob.png')
const HUGE_FILE = join(HUGE_ONLY, 'huge.txt')

/** Deliberately larger than the byte cap: the read must truncate, not skip. */
const HUGE_BYTES = 200 * 1024

/** The settings `scanForChinese` reads. */
const scan = (roots, overrides = {}) => scanForChinese(roots, { banModeMaxFiles: 400, banModeMaxDepth: 4, banModeMaxBytes: 65536, ...overrides })

/**
 * Build a context just real enough for `apply()`.
 * @returns the captured routes.
 */
function mount(config) {
  const routes = []
  const scope = {
    logger: () => ({ info: () => {}, warn: () => {} }),
    effect(callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    on: () => () => {},
    get: () => undefined,
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
  apply(scope, config)
  return routes
}

/**
 * Call the status route and decode its JSON body.
 *
 * `await`s the handler because it is async now: the scan reads the disk through
 * `node:fs/promises`, and `?on=1` deliberately waits for its first pass.
 *
 * @param handler - the registered handler.
 * @param query - the query string, including `?`, or an empty string.
 * @param method - HTTP method to send.
 * @returns `{ status, body, headers }`.
 */
async function callRaw(handler, query, method = 'GET') {
  let status = 0
  let body
  let headers = {}
  await handler(
    { method, url: `/dsh-cn-prank/status${query}`, headers: {} },
    {
      writeHead(code, sent) {
        status = code
        headers = sent ?? {}
      },
      end(chunk) {
        body = chunk === undefined ? undefined : Buffer.from(chunk).toString('utf8')
      },
    },
  )
  return { status, body, headers }
}

/** The 200-only shorthand most cases want. */
async function call(handler, query) {
  const result = await callRaw(handler, query)
  assert.equal(result.status, 200, `GET ${query} must answer 200`)
  return JSON.parse(String(result.body))
}

rmSync(FIXTURE, { recursive: true, force: true })
mkdirSync(join(ROUTE_ROOT, 'node_modules', 'some-lib'), { recursive: true })
mkdirSync(join(ONLY_SKIPPED, 'node_modules', 'lib'), { recursive: true })
mkdirSync(HUGE_ONLY, { recursive: true })
for (const index of [1, 2, 3, 4]) mkdirSync(join(MANY_DIRS, `d${String(index)}`), { recursive: true })
mkdirSync(join(FIXTURE, 'empty'), { recursive: true })

writeFileSync(CHINESE_FILE, '# 标题\n\n这是一份用来测试 Claude体验模式 的中文文件。\n', 'utf8')
writeFileSync(ENGLISH_FILE, 'nothing to see here, only latin letters\n', 'utf8')
writeFileSync(SKIPPED_LIB, '中文依赖说明,应当被跳过\n', 'utf8')
// A .png whose bytes happen to contain CJK: the extension allowlist must refuse it.
writeFileSync(BINARY_FILE, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('中文', 'utf8')]))
writeFileSync(HIDDEN_LIB, '中文依赖说明,应当被跳过\n', 'utf8')
writeFileSync(HIDDEN_BINARY, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('中文', 'utf8')]))
writeFileSync(HUGE_FILE, '中'.repeat(HUGE_BYTES), 'utf8')
for (const index of [1, 2, 3, 4]) writeFileSync(join(MANY_DIRS, `d${String(index)}`, 'notes.txt'), 'latin only\n', 'utf8')

try {
  const routes = mount({ banModeRoots: [ROUTE_ROOT], banModeIntervalMs: 60000 })
  const statusRoute = routes.find((route) => route.path === '/dsh-cn-prank/status')
  assert.ok(statusRoute !== undefined, 'apply() must register the status route')
  const handler = statusRoute.handler

  // ① Off by default: the sidebar button is what turns it on.
  const idle = await call(handler, '')
  assert.equal(idle.available, true)
  assert.equal(idle.on, false, 'Claude体验模式 must start off')
  assert.equal(idle.hit, null)
  assert.equal(idle.remainingMs, 0)
  assert.equal(idle.timer.minutes, 0, 'the re-check interval starts unset')
  assert.equal('roots' in idle, false, 'the status document must not leak workspace paths')

  // ② On: one pass, and the Chinese file is found.
  const on = await call(handler, '?on=1')
  assert.equal(on.on, true)
  assert.ok(on.hit !== null, 'a Chinese file in the roots must produce a hit')
  assert.equal(on.hit.path, CHINESE_FILE)
  assert.ok(on.hit.chars > 0, 'the hit must carry a character count')
  assert.ok(on.scanned > 0, 'the pass must report how many entries it looked at')

  // ③ The re-check interval, through the route: clamp, cancel, and the fact that
  //    setting it arms the master switch.
  const timed = await call(handler, '?timer=5')
  assert.equal(timed.timer.minutes, 5)
  assert.equal(timed.on, true, 'setting an interval must arm the master switch')
  assert.equal((await call(handler, '?timer=1e3')).timer.minutes, 60, 'a huge value must clamp to 60')
  assert.equal((await call(handler, '?timer=abc')).timer.minutes, 0, 'garbage must cancel, not throw')
  assert.equal((await call(handler, '?timer=-3')).timer.minutes, 0, 'a negative value must cancel')
  const zeroed = await call(handler, '?timer=0')
  assert.equal(zeroed.timer.minutes, 0)
  assert.equal(zeroed.on, true, 'cancelling the interval must not touch the master switch')

  // ④ The status route answers GET and HEAD only.
  const posted = await callRaw(handler, '?on=1', 'POST')
  assert.equal(posted.status, 405, 'POST must be refused')
  assert.equal(posted.headers.Allow, 'GET, HEAD')
  const headed = await callRaw(handler, '', 'HEAD')
  assert.equal(headed.status, 200)
  assert.equal(headed.body, undefined, 'a HEAD answer must carry no body')

  // ⑤ 暴打's 30 minutes: the hit is cleared, not merely hidden.
  const suppressed = await call(handler, '?suppress=1')
  assert.equal(suppressed.hit, null, 'suppressing must drop the hit that caused the popup')
  assert.ok(suppressed.remainingMs > 29 * 60 * 1000, 'the silence must be about 30 minutes')
  assert.ok(suppressed.remainingMs <= 30 * 60 * 1000)

  // ⑥ A pass during the silence must not re-arm the popup.
  const duringSilence = await call(handler, '?on=1')
  assert.equal(duringSilence.hit, null, 'a pass inside the silence must stay silent')
  assert.ok(duringSilence.remainingMs > 0)

  // ⑦ Off again.
  const off = await call(handler, '?on=0')
  assert.equal(off.on, false)
  assert.equal(off.hit, null)
  assert.equal(off.timer.minutes, 0, 'turning the master switch off clears the interval too')

  // ⑧ An empty root list still answers rather than throwing.
  const bare = mount({ banModeRoots: [], banModeIntervalMs: 60000 })
  const bareHandler = bare.find((route) => route.path === '/dsh-cn-prank/status')?.handler
  assert.ok(bareHandler !== undefined)
  assert.equal((await call(bareHandler, '')).on, false)

  // ⑨ Directly: a directory holding nothing but things that must be skipped really
  //    yields no hit. (Route-level `notEqual` assertions cannot prove this: the
  //    scanner returns on its first hit, so "the hit is not X" passes whether X was
  //    skipped or merely never reached.)
  const skippedOnly = await scan([ONLY_SKIPPED])
  assert.equal(skippedOnly.hit, null, 'node_modules and non-text extensions must produce no hit')
  assert.equal(skippedOnly.scanned, 0, 'an entry the scanner refuses to open is not charged to the budget')
  assert.ok((await scan([join(FIXTURE, 'empty')])).hit === null)

  // ⑩ Directly: the byte cap truncates rather than filters, so a huge Chinese file
  //    is still found — by its head.
  const huge = await scan([HUGE_ONLY])
  assert.ok(huge.hit !== null, 'a file over the byte cap must still be read, up to the cap')
  assert.equal(huge.hit.path, HUGE_FILE)
  assert.ok(huge.hit.chars > 1000, 'the truncated head still carries plenty of Chinese')

  // ⑪ Directly: directories count toward the budget, so a tree of nothing but
  //    directories cannot make one pass run forever.
  const budgeted = await scan([MANY_DIRS], { banModeMaxFiles: 3 })
  assert.equal(budgeted.scanned, 3, 'directories must be charged to the same budget as files')
  assert.equal(budgeted.hit, null)

  // ⑫ Directly: no roots, and a root that does not exist, are both quiet.
  assert.deepEqual(await scan([]), { scanned: 0, hit: null })
  assert.equal((await scan([MISSING])).hit, null)

  console.log('test-ban-mode: ok (hit, skips, truncation, budget, silence, toggle, timer, GET-only, empty roots)')
} finally {
  rmSync(FIXTURE, { recursive: true, force: true })
}
