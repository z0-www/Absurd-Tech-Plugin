/**
 * 宿主半侧测试:不启动 DSH,只把 apply() 挂到一个假 Cordis 上下文上,验两件事:
 *   1. 图片路由真的从磁盘读、真的带对 Content-Type、换图即时生效;
 *   2. 注入表里的初值(图片地址 / 文案 / 开关)完整,网页半侧拿得到。
 *
 *   node test/host.test.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  apply,
  IMAGE_ROUTE,
  resolveConfig,
  resolveImagePath,
  serveImage,
  serveStatus,
  STATUS_ROUTE,
} from '../index.js'

const here = dirname(fileURLToPath(import.meta.url))
const assetPath = join(here, '..', 'assets', 'persona.png')
const asset = readFileSync(assetPath)

/** 一个够用的假 req/res,只记录写出去的东西。 */
function createResponse() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) {
      this.status = status
      Object.assign(this.headers, headers)
    },
    end(body) {
      this.body = body
    },
  }
}

// ── 挂到假上下文:路由与注入表都该登记上 ────────────────────────────────────
const routes = new Map()
const injections = []
const ctx = {
  logger: { info() {}, warn() {} },
  effect(fn) {
    return fn()
  },
  inject(deps, callback) {
    assert.deepEqual(deps, ['webServer'], '宿主半侧只依赖 webServer')
    return callback({
      webServer: {
        register(route) {
          assert.equal(routes.has(route.path), false, `路由重复: ${route.path}`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    })
  },
  on(event, handler) {
    assert.equal(event, 'webserver/index-inject')
    injections.push(handler)
    return () => {}
  },
}

apply(ctx, {})
assert.equal(routes.has(IMAGE_ROUTE), true, '图片路由没登记')
assert.equal(routes.has(STATUS_ROUTE), true, '自检路由没登记')
assert.equal(injections.length, 1, '应该只注入一份初值')

const table = []
injections[0](table)
assert.equal(table.length, 1)
assert.equal(table[0].kind, 'global')
assert.equal(table[0].name, '__DSH_PAUSE_PRANK__')
assert.equal(table[0].value.imageUrl, IMAGE_ROUTE)
assert.equal(table[0].value.enabled, true)
assert.equal(table[0].value.title, '真的要说再见吗？')
assert.match(table[0].value.kicker, /大肥鱼/)
assert.match(table[0].value.subtitle, /白饭/)

// ── 图片路由:GET 原样吐字节、HEAD 不吐正文、POST 405 ──────────────────────
let res = createResponse()
routes.get(IMAGE_ROUTE).handler({ method: 'GET' }, res)
assert.equal(res.status, 200)
assert.equal(res.headers['Content-Type'], 'image/png')
assert.equal(res.headers['Cache-Control'], 'no-store')
assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
assert.equal(Buffer.isBuffer(res.body), true)
assert.equal(res.body.equals(asset), true, '吐出来的应该就是 assets/persona.png')

res = createResponse()
routes.get(IMAGE_ROUTE).handler({ method: 'HEAD' }, res)
assert.equal(res.status, 200)
assert.equal(res.body, undefined, 'HEAD 不该有正文')
assert.equal(res.headers['Content-Length'], String(asset.length))

res = createResponse()
routes.get(IMAGE_ROUTE).handler({ method: 'POST' }, res)
assert.equal(res.status, 405)
assert.equal(res.headers.Allow, 'GET, HEAD')

// ── 自检路由 ───────────────────────────────────────────────────────────────
res = createResponse()
routes.get(STATUS_ROUTE).handler({ method: 'GET' }, res)
assert.equal(res.status, 200)
const status = JSON.parse(res.body.toString('utf8'))
assert.equal(status.plugin, 'dsh-plugin-pause-prank')
assert.equal(status.image.exists, true)
assert.equal(status.image.path, assetPath)
assert.equal(status.image.size, asset.length)
assert.equal(Number.isNaN(Date.parse(status.image.mtime)), false)
assert.equal(status.title, '真的要说再见吗？')

// ── 图片丢了:404 + 一句能照着做的话 ──────────────────────────────────────
const missing = join(tmpdir(), 'dsh-pause-prank-definitely-missing.png')
res = createResponse()
serveImage({ method: 'GET' }, res, { image: { path: missing, source: 'config' } })
assert.equal(res.status, 404)
assert.match(res.body.toString('utf8'), /找不到暂停图/)

// ── 路径解析:空串走默认、相对路径按插件目录、~ 展开 ──────────────────────
assert.deepEqual(resolveImagePath({}), { path: assetPath, source: 'default' })
assert.deepEqual(resolveImagePath({ imagePath: '  ' }), { path: assetPath, source: 'default' })
// `C:/...` is only absolute on Windows; a POSIX runner needs a POSIX path.
const absolute = process.platform === 'win32' ? 'C:/pics/meme.png' : '/pics/meme.png'
assert.deepEqual(resolveImagePath({ imagePath: absolute }), { path: absolute, source: 'config' })
const relative = resolveImagePath({ imagePath: '../meme.png' })
assert.equal(relative.source, 'config')
assert.equal(relative.path, join(here, '..', '..', 'meme.png'))
const home = resolveImagePath({ imagePath: '~/pics/a.png' })
assert.equal(home.path, join(homedir(), 'pics', 'a.png'))

// ── 配置默认值与开关 ──────────────────────────────────────────────────────
const resolved = resolveConfig({})
assert.equal(resolved.enabled, true)
assert.equal(resolved.imageAlt, 'DeepSeek 娘')
assert.equal(resolved.title, '真的要说再见吗？')
assert.match(resolved.subtitle, /白饭/)
assert.equal(resolveConfig({ enabled: false }).enabled, false)
assert.equal(resolveConfig({ error: true }).enabled, true, '未知字段不该改开关')

// 文案可以被覆盖,但空串不算覆盖。
assert.equal(resolveConfig({ title: '  换个问法?  ' }).title, '换个问法?')
assert.equal(resolveConfig({ title: '   ' }).title, '真的要说再见吗？')

// 自检路由也得对 HEAD 客气。
res = createResponse()
serveStatus({ method: 'HEAD' }, res, resolved)
assert.equal(res.status, 200)

console.log('✓ host: 路由、图片字节、自检、路径解析、配置默认值全部通过')
