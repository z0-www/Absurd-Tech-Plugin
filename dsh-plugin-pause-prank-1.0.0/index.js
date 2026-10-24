/**
 * 暂停整活 · 真的要说再见吗 — Host half.
 *
 * 宿主半侧只做三件事:
 *
 *   1. **供图**:把 `assets/persona.png`(或配置里的 imagePath)通过
 *      `GET /dsh-pause-prank/image` 交给网页。**每次请求都重新读盘**,所以换图
 *      不用重启 DSH、不用刷新页面:点一次暂停就是新图。
 *   2. **注入初值**:随 index.html 把图片地址与文案写进
 *      `globalThis.__DSH_PAUSE_PRANK__`,网页半侧首帧就知道该画什么、该拦谁。
 *   3. **自检**:`GET /dsh-pause-prank/status` 回报解析到的绝对路径、文件在不在、
 *      多大、什么时候改过。换图后弹窗不对时,先看这一条。
 *
 * 刻意零依赖(只用 node 内置模块),也不 import 任何 `@deepseek-ai/*`:第三方
 * bundle 一旦依赖官方包,DSH 一升级就散架。
 *
 * 停不停由网页半侧决定:它拦下停止按钮的点击、弹出对话框,用户点「继续卸载」
 * 才把这一下补发给官方那颗按钮。宿主不碰会话、不碰模型、不碰权限。
 *
 * @module dsh-plugin-pause-prank
 */

import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名,出现在 Loader 诊断里。 */
export const name = 'pause-prank'

/** 插件包根目录。link 安装时就是桌面那个目录,所以换图改的就是你眼前这份。 */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))

/** 默认图片:包内 assets/persona.png(大肥鱼/DeepSeek 娘)。 */
const DEFAULT_IMAGE = join(PLUGIN_DIR, 'assets', 'persona.png')

/** 网页取图的路由。 */
export const IMAGE_ROUTE = '/dsh-pause-prank/image'

/** 自检路由。 */
export const STATUS_ROUTE = '/dsh-pause-prank/status'

/** 结构化 index 注入事件;与 @deepseek-ai/dsh-host-webserver 的契约一致。 */
const INDEX_INJECT_EVENT = 'webserver/index-inject'

/** 网页半侧读初始配置的全局名。 */
const GLOBAL_KEY = '__DSH_PAUSE_PRANK__'

/** 图片上限。一张立绘 20MB 已经很离谱了,再大就是配错路径了。 */
const MAX_IMAGE_BYTES = 24 * 1024 * 1024

/** 扩展名 → Content-Type。 */
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

/** 默认文案。网页半侧有一份同样的兜底,改这里别忘了那边。 */
const DEFAULTS = {
  imageAlt: 'DeepSeek 娘',
  title: '真的要说再见吗？',
  subtitle: '这一轮才刚开始，白饭还没吃完呢……',
  cruelSubtitle: '要把大肥鱼一个人留在这里吗？',
  kicker: '🐟 大肥鱼食堂 · 暂停确认',
  complainToast: '已记录你的不满，并转交给了大肥鱼 🐟',
}

/** 只接受非空字符串,其余退回默认值。 */
function text(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

/**
 * 把配置里的 imagePath 解析成绝对路径。
 *
 * 空串 = 包内默认图;`~` / `~/x` 展开到用户目录;相对路径按插件包根目录解析。
 * 这样 cordis.patch.yml 里既能写 `C:/pics/a.png`,也能写 `../meme.png`。
 *
 * @param rawConfig - 插件原始配置。
 * @returns `{ path, source }`,source 是 `default` 或 `config`。
 */
export function resolveImagePath(rawConfig = {}) {
  const raw = typeof rawConfig?.imagePath === 'string' ? rawConfig.imagePath.trim() : ''
  if (raw === '') return { path: DEFAULT_IMAGE, source: 'default' }
  const expanded = raw === '~'
    ? homedir()
    : raw.startsWith('~/') || raw.startsWith('~\\')
      ? join(homedir(), raw.slice(2))
      : raw
  return { path: isAbsolute(expanded) ? expanded : resolve(PLUGIN_DIR, expanded), source: 'config' }
}

/**
 * 解析插件配置。网页半侧最终从注入的全局变量里读同一份结果。
 *
 * @param raw - Cordis 传进来的原始配置。
 * @returns 已补全、已清洗的配置。
 */
export function resolveConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    enabled: source.enabled !== false,
    image: resolveImagePath(source),
    imageAlt: text(source.imageAlt, DEFAULTS.imageAlt),
    title: text(source.title, DEFAULTS.title),
    subtitle: text(source.subtitle, DEFAULTS.subtitle),
    cruelSubtitle: text(source.cruelSubtitle, DEFAULTS.cruelSubtitle),
    kicker: text(source.kicker, DEFAULTS.kicker),
    complainToast: text(source.complainToast, DEFAULTS.complainToast),
  }
}

/** 走平台日志服务报一行;日志本身绝不能成为挂载失败的原因。 */
function report(ctx, level, message) {
  try {
    const scoped = typeof ctx?.logger === 'function' ? ctx.logger(name) : undefined
    const logger = scoped ?? ctx?.logger
    const sink = logger?.[level]
    if (typeof sink === 'function') {
      sink.call(logger, message)
      return
    }
  } catch {
    /* 落到下面 */
  }
  if (level === 'warn') console.warn(`pause-prank: ${message}`)
}

/** 一段纯文本响应。 */
function sendText(res, status, body) {
  const data = Buffer.from(body, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(data.length),
  })
  res.end(data)
}

/** 一段 JSON 响应。 */
function sendJson(res, status, value) {
  const data = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(data.length),
  })
  res.end(data)
}

/** 不是 GET/HEAD 就回 405,顺手带上 Allow。 */
function rejectMethod(res, method) {
  res.writeHead(405, {
    Allow: 'GET, HEAD',
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(`${method} 不支持：这条路由只读。`)
}

/**
 * 图片路由:每次请求现读文件,换图即时生效。
 *
 * 为什么不用 `Cache-Control: max-age`:换图是这个插件最常做的操作,任何一层
 * 缓存都会让"我明明换了啊"变成排障现场。no-store 换来的代价只是本地磁盘读一次。
 *
 * @param req - node:http 请求。
 * @param res - node:http 响应。
 * @param config - 已解析配置。
 */
export function serveImage(req, res, config) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    rejectMethod(res, method)
    return
  }
  const file = config.image.path
  let data
  try {
    data = readFileSync(file)
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : 'READ_FAILED'
    sendText(
      res,
      404,
      `找不到暂停图： ${file} (${code})\n`
      + '把图片放回这个路径，或在 cordis.patch.yml 里把 imagePath 指到别处。\n'
      + `自检：GET ${STATUS_ROUTE}`,
    )
    return
  }
  if (data.length > MAX_IMAGE_BYTES) {
    sendText(res, 413, `图片太大： ${file} 有 ${data.length} 字节，上限 ${MAX_IMAGE_BYTES}。换成普通立绘即可。`)
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': String(data.length),
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(method === 'HEAD' ? undefined : data)
}

/**
 * 自检路由:换图之后先打这一条,比截图猜快。
 *
 * @param req - node:http 请求。
 * @param res - node:http 响应。
 * @param config - 已解析配置。
 */
export function serveStatus(req, res, config) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    rejectMethod(res, method)
    return
  }
  let file
  try {
    const stats = statSync(config.image.path)
    file = {
      exists: true,
      size: stats.size,
      mtime: new Date(stats.mtimeMs).toISOString(),
    }
  } catch {
    file = { exists: false }
  }
  sendJson(res, 200, {
    plugin: 'dsh-plugin-pause-prank',
    enabled: config.enabled,
    image: {
      path: config.image.path,
      source: config.image.source,
      ...file,
    },
    title: config.title,
    subtitle: config.subtitle,
    cruelSubtitle: config.cruelSubtitle,
    kicker: config.kicker,
  })
}

/**
 * 挂载宿主半侧。
 *
 * @param ctx - Cordis 上下文。
 * @param rawConfig - 配置(来自 cordis.patch.yml)。
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  report(ctx, 'info', `pause-prank: 已挂载,图片 ${config.image.path}`)

  // 两条只读路由:图片 + 自检。写操作一个都没有,所以没有任何跨站风险。
  ctx.effect(
    () =>
      ctx.inject(['webServer'], (scoped) => {
        const disposers = [
          scoped.webServer.register({
            kind: 'exact',
            path: IMAGE_ROUTE,
            handler: (req, res) => serveImage(req, res, config),
          }),
          scoped.webServer.register({
            kind: 'exact',
            path: STATUS_ROUTE,
            handler: (req, res) => serveStatus(req, res, config),
          }),
        ]
        return () => {
          for (const dispose of disposers) dispose()
        }
      }),
    'pause-prank: image + status routes',
  )

  // 首帧配置:网页半侧不等网络请求就能决定要不要装拦截器、图该从哪里取。
  ctx.effect(
    () =>
      ctx.on(INDEX_INJECT_EVENT, (table) => {
        if (Array.isArray(table) !== true) return
        table.push({
          kind: 'global',
          name: GLOBAL_KEY,
          value: {
            enabled: config.enabled,
            imageUrl: IMAGE_ROUTE,
            imageAlt: config.imageAlt,
            title: config.title,
            subtitle: config.subtitle,
            cruelSubtitle: config.cruelSubtitle,
            kicker: config.kicker,
            complainToast: config.complainToast,
          },
        })
      }),
    'pause-prank: initial config',
  )
}
