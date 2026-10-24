/**
 * 时区封锁令 · Time-Zone Lockdown — Host half.
 *
 * The gag lives entirely in the browser: a full-frame letter, a fake local audit
 * and two doors in the letter's footer. This half owns the four things the browser cannot own
 * for itself:
 *
 *  1. the Loader row, which is what makes `dsh.client` in `package.json` a live
 *     Client entry at all (no row, no bundle);
 *  2. the row's `config`, republished to the page as `window.__DSH_CN_PRANK__`;
 *  3. `assets/beat.mp4` — the clip the 暴打 button plays, served over one
 *     Range-capable route instead of being inlined into the Client bundle;
 *  4. Claude体验模式 — the file scanner behind the sidebar button, and the 30-minute
 *     silence a click on 暴打 buys. This is the only part of the plugin that reads
 *     anything off the disk, so it is also the only part with a privacy story: it
 *     is opt-in, it is bounded, and it never leaves the machine;
 *  5. the time-zone re-check interval — one number, stored here so the setting
 *     survives a page refresh without the browser having to remember it. The clock
 *     itself lives in the Client half; the host only keeps the number.
 *
 * The second one is not decoration. A Client half is a separate module with no
 * seat on the Host's Loader row, so the only supported way to hand it settings is
 * the structured index-injection table: a `{ kind: 'global' }` row survives both
 * the Web composition (`renderIndex`) and the Desktop shell, which reads that
 * table over IPC instead of rendering the page itself.
 *
 * The third one is a size decision. A 2 MB clip base64'd into `client.js` would be
 * downloaded on **every page load** — the bundle is `immediately: true`, because
 * the lockdown has to beat the composer to the screen. A route is fetched the
 * first time somebody actually clicks 暴打, and never otherwise.
 *
 * Deliberately dependency-free: a third-party bundle is installed from GitHub or
 * npm, so it must not import any `@deepseek-ai/*` package and stays loadable
 * across DSH releases.
 *
 * @module dsh-plugin-cn-prank
 */

import { readFileSync } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Cordis plugin name, used in Loader diagnostics. */
export const name = 'cn-prank'

/** Global the Client half reads; keep in sync with `client.js`. */
const GLOBAL_KEY = '__DSH_CN_PRANK__'

/** Index-injection table event carrying every `{ kind: 'global' }` row. */
const INDEX_INJECT_EVENT = 'webserver/index-inject'

/** 会触发封锁的时区。Zones that arm the lockdown. */
const DEFAULT_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'PRC',
  'Asia/Macau',
  'Asia/Hong_Kong',
  'Asia/Taipei',
]

/** 页面加载后多久弹出。Delay before the letter shows, in milliseconds. */
const DEFAULT_DELAY_MS = 900

/** 假扫描的时长上限。Upper bound of the fake audit, in milliseconds. */
const DEFAULT_SCAN_MS = 4200

/** 裁定书自动放行前的等待。0 = 必须自己点按钮。 */
const DEFAULT_REASON_AUTO_CLOSE_MS = 0

/** 敲打动画的总时长。0 = 点「暴打」立刻放行。 */
const DEFAULT_BEAT_MS = 3200

/** 「暴打」一共敲几下 —— 只用来算进度条和「已敲打 N 次」那句话。 */
const DEFAULT_BEAT_HITS = 9

/**
 * `assets/beat.mp4` 自己的音轨音量。
 *
 * 那条音轨一直都在 —— 之前没声音是因为浏览器不允许「带声自动播放」,而插件选了最
 * 省事的做法:直接 `muted`。现在改成先带声试、被拒才退回静音,所以这个值是它正常
 * 播放时的音量。
 */
const DEFAULT_BEAT_VOLUME = 0.9

/** 合成打击音效的音量。 */
const DEFAULT_BEAT_SFX_VOLUME = 0.5

/** 视频路由。The one path the Client half asks for. */
const VIDEO_ROUTE = '/dsh-cn-prank/beat.mp4'

/**
 * 「暴打」用的视频。放进 `assets/beat.mp4` 即可生效;文件不在时这条路返回 404,
 * 浏览器侧试完全部 URL 之后**直接放行** —— 1.7.0 起视频是唯一的动画。
 *
 * Resolved from `import.meta.url`, not from `process.cwd()`: a profile installs this
 * package at an arbitrary depth, and the working directory of the host process has
 * nothing to do with where the bundle landed.
 */
const VIDEO_FILE = new URL('./assets/beat.mp4', import.meta.url)

/** Claude体验模式的状态与开关路由。The one path the sidebar button talks to. */
const STATUS_ROUTE = '/dsh-cn-prank/status'

/** Claude体验模式的扫描间隔。 */
const DEFAULT_BAN_INTERVAL_MS = 10000

/** 点「暴打」买到的静默时长:30 分钟。 */
const DEFAULT_BAN_SUPPRESS_MS = 30 * 60 * 1000

/** 一轮扫描最多看多少个文件。 */
const DEFAULT_BAN_MAX_FILES = 400

/** 单个文件最多读多少字节。超过就当二进制跳过。 */
const DEFAULT_BAN_MAX_BYTES = 64 * 1024

/** 往下钻几层。 */
const DEFAULT_BAN_MAX_DEPTH = 4

/** 额外的扫描根目录;留空 = 用 DSH 里已登记的工作区。 */
const DEFAULT_BAN_ROOTS = []



/**
 * 不往里看的目录。这不是压缩包意义上的黑名单,只是「里面全是别人写的东西」:
 * 依赖树、版本库内部、构建产物。少了这一层,一次扫描会把 10 秒的间隔全花在
 * `node_modules` 上,而且找到的第一个中文一定来自某个库的 README。
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.pnpm',
  '.yarn',
  '.next',
  '.nuxt',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'target',
  '.edge-profile',
])

/** 会去读的扩展名。其余一律当二进制,连打开都不打开。 */
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.jsonc',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.csv',
  '.tsv',
  '.xml',
  '.sql',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.psm1',
  '.bat',
  '.cmd',
  '.lua',
  '.r',
  '.m',
  '.swift',
  '.dart',
  '.gradle',
  '.properties',
])

/**
 * 中文字符。覆盖基本区、扩展 A 区、兼容表意文字,以及中文标点里最常出现的那几个。
 *
 * 没有全局标志:这里只用 `String.prototype.match`,而带 `g` 的正则对象在 `match` 上
 * 不返回捕获组、还带 `lastIndex` 状态 —— 一个跨文件共用的有状态正则,迟早会数错。
 */
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 数一段文本里的中文字符个数。
 * @param text - the decoded text.
 * @returns the number of CJK characters.
 */
function countChinese(text) {
  let count = 0
  for (const character of text) {
    if (CJK_PATTERN.test(character)) count += 1
  }
  return count
}

/**
 * Decide whether a file is worth opening at all.
 *
 * Extension-based, and deliberately optimistic for extension-less files: a
 * `README` with no suffix is exactly the kind of thing this gag is looking for.
 *
 * `dot <= 0` also catches dotfiles (`.gitignore` has its dot at index 0), which is
 * why listing dotfile extensions in `TEXT_EXTENSIONS` is pointless — and why the two
 * that used to be listed there (`.gitignore`, `.editorconfig`) were removed rather
 * than left in place looking authoritative.
 *
 * @param name - the file's basename.
 * @returns whether to read it.
 */
function worthReading(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return true
  return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

/**
 * Open one file and count the Chinese characters in its head.
 *
 * Bounded twice on purpose: by the configured byte cap and by the file's own size,
 * so a 2 GB log next to a README cannot stall the scan. Anything unreadable —
 * permissions, a vanished file, a device node — counts as zero rather than as an
 * error, because a scanner that throws is a scanner that stops scanning.
 *
 * The cap is a **truncation**, not a filter: a 200 KB file still gets its first
 * `maxBytes` counted. It used to be a filter (`size > maxBytes → 0`), which made
 * every large file invisible and left the `subarray` below as dead code — the
 * difference between "this plugin never notices a big Chinese document" and "it
 * reads the head of one". `open` + `read` is what makes truncation cheap: it never
 * pulls the whole file into memory the way `readFile` would.
 *
 * Asynchronous on purpose, and that is not a style choice: the Host process is a
 * single event loop shared with every live agent turn. A synchronous walk of four
 * hundred files would freeze all of them for the duration of the pass, every pass.
 *
 * @param file - absolute path.
 * @param maxBytes - read cap.
 * @returns the count, or `0`.
 */
async function countChineseInFile(file, maxBytes) {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size === 0) return 0
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(maxBytes, info.size))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return countChinese(buffer.subarray(0, bytesRead).toString('utf8'))
    } finally {
      await handle.close()
    }
  } catch {
    return 0
  }
}

/**
 * Walk a set of roots until the budget runs out or Chinese turns up.
 *
 * Breadth-first via an explicit queue rather than recursion: a deep tree next to a
 * broken symlink should be a slow scan, never a blown call stack. The queue is
 * consumed with a cursor instead of `shift()` — `shift()` is O(n) per call, so a
 * wide tree would spend its budget moving array elements around.
 *
 * `banModeMaxFiles` caps **entries examined**, files *and* directories together.
 * Counting only files was a hole: a tree of nothing but directories (or nothing but
 * skipped extensions) never reached the cap, so one pass could run for a very long
 * time — and `?on=1` waits for the first pass, so the click would appear to hang.
 *
 * @param roots - absolute directories to start from.
 * @param settings - the projected row config.
 * @returns `{ scanned, hit }` where `hit` is `{ path, chars, at }` or `null`.
 */
export async function scanForChinese(roots, settings) {
  const queue = roots.map((root) => ({ dir: root, depth: 0 }))
  let cursor = 0
  let scanned = 0
  while (cursor < queue.length) {
    const next = queue[cursor]
    cursor += 1
    if (next === undefined) break
    let entries
    try {
      entries = await readdir(next.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (scanned >= settings.banModeMaxFiles) return { scanned, hit: null }
      const full = join(next.dir, entry.name)
      if (entry.isDirectory()) {
        if (next.depth >= settings.banModeMaxDepth) continue
        if (SKIP_DIRS.has(entry.name)) continue
        scanned += 1
        queue.push({ dir: full, depth: next.depth + 1 })
        continue
      }
      // 符号链接一律不跟随:一个指回上层的链接就是一个无限扫描。
      if (!entry.isFile()) continue
      if (!worthReading(entry.name)) continue
      scanned += 1
      const chars = await countChineseInFile(full, settings.banModeMaxBytes)
      if (chars > 0) return { scanned, hit: { path: full, chars, at: Date.now() } }
    }
  }
  return { scanned, hit: null }
}

/**
 * The roots one pass should walk.
 *
 * Defaulting to the DSH workspace list rather than to a home directory is the one
 * privacy decision in this plugin worth stating out loud: Claude体验模式 should look at
 * the folders the user actually chose to work in, not at everything they own.
 * `banModeRoots` is the escape hatch for anyone who wants more.
 *
 * With no registry and no explicit roots this returns **nothing**, and a scan with
 * no roots finds nothing. It used to fall back to `process.cwd()`, which on another
 * machine is whatever directory the Harness happened to be launched from — scanning
 * a stranger's install directory is a worse failure than not scanning at all, and
 * the README promises "your registered workspaces, not everything you own".
 *
 * @param ctx - the plugin's Cordis context.
 * @param settings - the projected row config.
 * @returns absolute directory paths.
 */
export function banRoots(ctx, settings) {
  if (settings.banModeRoots.length > 0) return settings.banModeRoots
  try {
    const registry = ctx.get('workspaceRegistry')
    if (registry !== undefined && typeof registry.list === 'function') {
      const paths = registry
        .list()
        .map((workspace) => workspace?.path)
        .filter((path) => typeof path === 'string' && path !== '')
      if (paths.length > 0) return paths
    }
  } catch {
    /* a composition without the registry simply scans nothing */
  }
  return []
}

/**
 * Create the per-mount Claude体验模式 state.
 *
 * Deliberately in memory: the 30-minute silence is a mood, not a durable record,
 * and a DSH restart clearing it is the behaviour a person would expect from a
 * prank switch.
 *
 * @returns the mutable state object.
 */
export function createBanState() {
  return {
    on: false,
    suppressedUntil: 0,
    hit: null,
    scanned: 0,
    lastScanAt: 0,
    roots: [],
    /** 复查间隔的分钟数;0 = 没设。宿主只负责把它存住,时钟在 Client 半侧。 */
    timerMinutes: 0,
    /** 扫描用的 `setInterval` 句柄 —— 和上面那个滑块的「复查间隔」不是一回事。 */
    scanner: null,
    /** 一轮还没跑完时不再起第二轮 —— 异步化之后这是必须的,不再是可选项。 */
    inFlight: false,
  }
}

/**
 * Stop the scan timer, if one is running.
 * @param ban - the state object.
 */
function stopScanner(ban) {
  if (ban.scanner !== null) {
    clearInterval(ban.scanner)
    ban.scanner = null
  }
}

/**
 * Run one scan pass and fold the result into the state.
 *
 * A hit found while the 30 minutes are still running is thrown away rather than
 * stored, which is what makes the silence actually last: the next pass after the
 * window closes is the one that re-arms the popup, with a fresh `at` so the Client
 * half can tell it apart from the one it already dismissed.
 *
 * @param ctx - the plugin's Cordis context.
 * @param ban - the state object.
 * @param settings - the projected row config.
 */
async function scanPass(ctx, ban, settings) {
  // `banMode: false` 时按钮仍然在(它现在是总开关),但扫描这件事本身没被启用 ——
  // 关掉扫描能力就必须真的不读盘,而不是「读了但不显示」。
  if (!settings.banMode) return
  if (!ban.on || ban.inFlight) return
  ban.inFlight = true
  try {
    ban.roots = banRoots(ctx, settings)
    const result = await scanForChinese(ban.roots, settings)
    ban.scanned = result.scanned
    ban.lastScanAt = Date.now()
    if (result.hit !== null && Date.now() >= ban.suppressedUntil) ban.hit = result.hit
  } finally {
    ban.inFlight = false
  }
}

/**
 * Turn Claude体验模式 on or off, starting or stopping the timer with it.
 * @param ctx - the plugin's Cordis context.
 * @param ban - the state object.
 * @param settings - the projected row config.
 * @param on - the requested state.
 */
async function setBanMode(ctx, ban, settings, on) {
  if (ban.on === on) return
  ban.on = on
  if (!on) {
    stopScanner(ban)
    ban.hit = null
    // 总开关关掉就取消挂着的复查间隔 —— 「关 = 零弹窗」这条规则不能被一个已经排好的
    // 间隔绕过去。
    ban.timerMinutes = 0
    return
  }
  // 第一次扫描**等它跑完**再回这个请求:异步化之后若不等,点完按钮的第一次轮询会
  // 拿到一份还没有命中的状态,用户会看到状态灯先绿再红地跳一下。
  await scanPass(ctx, ban, settings)
  ban.scanner = setInterval(() => void scanPass(ctx, ban, settings), Math.max(1000, settings.banModeIntervalMs))
  // 一个恶作剧不该拖着 node 进程不让它退出。
  if (typeof ban.scanner?.unref === 'function') ban.scanner.unref()
}

/**
 * Start the 30-minute silence and drop the hit that caused it.
 * @param ban - the state object.
 * @param settings - the projected row config.
 */
function suppressBan(ban, settings) {
  ban.suppressedUntil = Date.now() + settings.banModeSuppressMs
  ban.hit = null
}


/**
 * Set or cancel the Client half's time-zone re-check interval.
 *
 * This one trigger needs no Chinese file: it is the only way to get the letter
 * without the scan finding anything, and the *client* owns the clock — it asks
 * "how often should I confirm the system time zone is still China", and pops the
 * letter again every time the answer is still yes.
 *
 * That is why it is a plain number and not a deadline: a deadline would say
 * "pop once, N minutes from now", which is the opposite question, and it would
 * leave the client half with a state that has already expired on reload. The
 * number lives here so a page refresh does not lose the setting.
 *
 * @param ban - the state object.
 * @param minutes - 1..60, or anything else to cancel.
 */
function setTimerMinutes(ban, minutes) {
  const value = Math.round(Number(minutes))
  ban.timerMinutes = Number.isFinite(value) && value > 0 ? Math.min(60, Math.max(1, value)) : 0
}

/**
 * The status document the Client half polls.
 *
 * One endpoint carries all three features on purpose: the page already polls it
 * every five seconds, and both the Claude体验模式 toggle and the re-check interval
 * want exactly that cadence. Two routes would mean two pollers, two failure
 * modes and two moments in time.
 *
 * @param ban - the ban state object.
 * @param settings - the projected row config.
 * @returns a plain JSON-safe object.
 */
export function banStatus(ban, settings) {
  return {
    // 按钮的可用性现在跟着总开关走,不再跟着扫描能力走:它是整个插件的总闸。
    available: settings.enabled,
    // 扫描能力本身(`banMode`)。客户端读它来区分「开着而且在扫」和「开着但扫不了」——
    // 少了这个字段,`banMode: false` 时那颗灯会一直是绿的,说「正在扫」。
    scans: settings.banMode,
    on: ban.on,
    remainingMs: Math.max(0, ban.suppressedUntil - Date.now()),
    suppressMs: settings.banModeSuppressMs,
    intervalMs: settings.banModeIntervalMs,
    hit: ban.hit,
    scanned: ban.scanned,
    lastScanAt: ban.lastScanAt,
    // `roots` 删掉了。它带着用户工作区的绝对路径,而这份文档是
    // `Access-Control-Allow-Origin: *` 发出去的,客户端又从来不读它 ——
    // 一条「没人用、只泄露、还跨源可读」的字段没有任何留下的理由。
    // 复查间隔就是这一个数字。没有 `dueAt`、没有 `remainingMs`:间隔不会「到期」,
    // 到点只是再确认一次时区 —— 一个已经过期的到期时间戳会让侧边栏在设好 1 分钟
    // 之后自己变灰,说「未设定」,而复查其实还在跑。
    timer: {
      minutes: ban.timerMinutes,
    },
  }
}

/**
 * Answer one status request.
 *
 * Everything is a GET with query flags, including the three mutations. That is a
 * deliberate trade: a `POST` with a JSON content type from the page would drag a
 * CORS preflight through the host's connection fence for no benefit, and the worst
 * a cross-site `GET` can do here is toggle a prank the user can toggle back.
 *
 * @param ctx - the plugin's Cordis context.
 * @param ban - the ban state object.
 * @param settings - the projected row config.
 * @param req - the incoming request.
 * @param res - the response to own.
 */
async function serveStatus(ctx, ban, settings, req, res) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  const headOnly = method === 'HEAD'
  // Read this route the same way the video route is read: GET and HEAD only.
  //
  // Everything here is a GET with query flags, *including* the three mutations, so a
  // browser is the intended caller. Accepting POST as well bought nothing and widened
  // the surface: any page that can reach this port (the response carries
  // `Access-Control-Allow-Origin: *`) could flip the prank or write a 30-minute
  // silence with a preflighted request. The cross-site `GET` risk is unchanged and
  // was already accepted; there is no reason to also accept the method that needs a
  // preflight to get through.
  if (!headOnly && method !== 'GET') {
    res.writeHead(405, {
      Allow: 'GET, HEAD',
      'Content-Length': '0',
      'Access-Control-Allow-Origin': '*',
    })
    res.end()
    return
  }

  let query
  try {
    query = new URL(String(req?.url ?? STATUS_ROUTE), 'http://127.0.0.1').searchParams
  } catch {
    query = new URLSearchParams()
  }

  const requested = query.get('on')
  if (requested === '1') await setBanMode(ctx, ban, settings, true)
  else if (requested === '0') await setBanMode(ctx, ban, settings, false)
  if (query.get('suppress') === '1') suppressBan(ban, settings)
  // 设复查间隔本身就等于「现在开始」,所以它顺手把总开关打开 —— 否则用户填完
  // 数字框却什么都不发生,而原因藏在另一个按钮里。
  const requestedTimer = query.get('timer')
  if (requestedTimer !== null) {
    const minutes = Number(requestedTimer)
    if (Number.isFinite(minutes) && minutes > 0) await setBanMode(ctx, ban, settings, true)
    setTimerMinutes(ban, minutes)
  }

  const body = Buffer.from(JSON.stringify(banStatus(ban, settings)), 'utf8')
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(headOnly ? undefined : body)
}

/**
 * Read one row option, treating `undefined` and `null` as absent.
 * @param config - the row's `config` object, possibly absent.
 * @param key - option name.
 * @param fallback - value used when the option is absent.
 * @returns the configured value or the fallback.
 */
function optionOf(config, key, fallback) {
  const value = config === undefined || config === null ? undefined : config[key]
  return value === undefined || value === null ? fallback : value
}

/**
 * Read one boolean row option.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - value used when the option is absent or not a boolean.
 * @returns the configured boolean or the fallback.
 */
function booleanOption(config, key, fallback) {
  const value = optionOf(config, key, fallback)
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Read one non-negative number row option.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - value used when the option is absent or not a finite number.
 * @returns the configured number or the fallback.
 */
function numberOption(config, key, fallback) {
  const value = Number(optionOf(config, key, fallback))
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Read the time-zone list, dropping blank entries and duplicates.
 * @param config - the row's `config` object.
 * @param key - option name.
 * @param fallback - zones used when the option holds no usable string.
 * @returns a de-duplicated list of zone names.
 */
function stringListOption(config, key, fallback) {
  const value = optionOf(config, key, fallback)
  if (!Array.isArray(value)) return [...fallback]
  const zones = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const zone = entry.trim()
    if (zone === '' || zones.includes(zone)) continue
    zones.push(zone)
  }
  return zones.length > 0 ? zones : [...fallback]
}

/**
 * Report one line through the platform logging service. Logging must never be the
 * reason a mount fails, so every shape is attempted best-effort and then given up.
 * @param ctx - the plugin's Cordis context.
 * @param level - `info` or `warn`.
 * @param message - already-formatted line; `%` is not used, so no format arguments.
 */
function report(ctx, level, message) {
  try {
    const scoped = typeof ctx.logger === 'function' ? ctx.logger('cn-prank') : undefined
    const logger = scoped ?? ctx.logger
    const sink = logger?.[level]
    if (typeof sink === 'function') {
      sink.call(logger, message)
      return
    }
  } catch {
    /* fall through to the console below */
  }
  if (level === 'warn') console.warn(`cn-prank: ${message}`)
}

/**
 * Absolute origin of this Harness's web surface, when the process knows one.
 *
 * The page this plugin runs in is usually served by the same server that owns this
 * route, and then the relative path is enough. It is *not* guaranteed: the Desktop
 * shell can host its own `dsh-app://` document, and an absolute URL is the only
 * shape that survives that. `DSH_WEB_URL` is set by the launcher when it knows the
 * answer, so it is read defensively and simply omitted when absent.
 *
 * @returns a bare `scheme://host:port`, or `''`.
 */
function absoluteOrigin() {
  try {
    const raw = typeof process === 'undefined' ? '' : String(process.env?.DSH_WEB_URL ?? '')
    const value = raw.trim().replace(/\/+$/, '')
    return /^https?:\/\//i.test(value) ? value : ''
  } catch {
    return ''
  }
}

/**
 * The URLs the Client half should try, in order, for the beat video.
 * @param enabled - the row's `beatVideo` switch.
 * @returns an empty array, or one or two absolute/relative URLs.
 */
function videoUrls(enabled) {
  if (!enabled) return []
  const origin = absoluteOrigin()
  const urls = origin === '' ? [] : [origin + VIDEO_ROUTE]
  urls.push(VIDEO_ROUTE)
  return urls
}

/**
 * The URLs the sidebar button and the overlay poll for Claude体验模式 status.
 * @param enabled - the row's `banMode` switch.
 * @returns an empty array, or one or two absolute/relative URLs.
 */
function statusUrls(enabled) {
  if (!enabled) return []
  const origin = absoluteOrigin()
  const urls = origin === '' ? [] : [origin + STATUS_ROUTE]
  urls.push(STATUS_ROUTE)
  return urls
}

/**
 * Parse one `Range` request header against a known body length.
 *
 * The browser will not scrub a video it cannot range-request. Chromium falls back
 * to "download the whole thing, then seek", which for a 10-second clip means the
 * first click on 暴打 shows a frozen first frame until the file lands. One
 * `206 Partial Content` is the difference between an animation and a hang.
 *
 * @param header - the raw `Range` header, if any.
 * @param total - the full body length in bytes.
 * @returns `{ start, end }` inclusive, or `null` for "send everything".
 */
function parseRange(header, total) {
  if (typeof header !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null
  let start
  let end
  if (rawStart === '') {
    // 后缀区间:最后 N 个字节。Suffix range: the last N bytes.
    const length = Number(rawEnd)
    if (!Number.isFinite(length) || length <= 0) return null
    start = Math.max(0, total - length)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? total - 1 : Number(rawEnd)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start > end || start >= total) return null
  return { start, end: Math.min(end, total - 1) }
}

/**
 * Answer one request for `assets/beat.mp4`.
 *
 * The file is re-read per request rather than cached: it is a local file that the
 * author is expected to swap, and `Cache-Control: no-store` means the browser asks
 * again anyway, so a cache would only add a stale-bytes failure mode.
 *
 * @param ctx - the plugin's Cordis context, for the one warning.
 * @param req - the incoming request.
 * @param res - the response to own.
 */
function serveVideo(ctx, req, res) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  const headOnly = method === 'HEAD'
  if (!headOnly && method !== 'GET') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('method not allowed')
    return
  }

  let bytes
  try {
    bytes = readFileSync(VIDEO_FILE)
  } catch {
    // 没有素材。浏览器侧试完全部 URL 之后会直接放行,所以这里只留一行日志 ——
    // 「放不出动画」不是错误路径,它是一个合法的配置(1.7.0 起视频是唯一动画)。
    report(ctx, 'info', 'no assets/beat.mp4 installed, so 暴打 releases immediately')
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('no beat video installed')
    return
  }

  const total = bytes.length
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    // 页面可能是 dsh-app:// 而不是同源的 http://127.0.0.1:port,所以显式放开 CORS。
    'Access-Control-Allow-Origin': '*',
  }

  const range = parseRange(req?.headers?.range, total)
  if (range === null) {
    res.writeHead(200, { ...headers, 'Content-Length': String(total) })
    res.end(headOnly ? undefined : bytes)
    return
  }

  const chunk = bytes.subarray(range.start, range.end + 1)
  res.writeHead(206, {
    ...headers,
    'Content-Range': `bytes ${String(range.start)}-${String(range.end)}/${String(total)}`,
    'Content-Length': String(chunk.length),
  })
  res.end(headOnly ? undefined : chunk)
}

/**
 * Project the Loader row's `config` into the exact shape the Client half reads.
 *
 * Every field is resolved here rather than in the browser so that one file — this
 * one, next to the `cordis.patch.yml` comment — stays the single place a stranger
 * has to read to answer "what is configurable?".
 *
 * @param config - the Loader row's `config`.
 * @returns the published settings object.
 */
export function projectConfig(config) {
  return {
    enabled: booleanOption(config, 'enabled', true),
    timezones: stringListOption(config, 'timezones', DEFAULT_TIMEZONES),
    delayMs: numberOption(config, 'delayMs', DEFAULT_DELAY_MS),
    oncePerSession: booleanOption(config, 'oncePerSession', true),
    blockKeyboard: booleanOption(config, 'blockKeyboard', true),
    scanMs: numberOption(config, 'scanMs', DEFAULT_SCAN_MS),
    reasonAutoCloseMs: numberOption(config, 'reasonAutoCloseMs', DEFAULT_REASON_AUTO_CLOSE_MS),
    beatMs: numberOption(config, 'beatMs', DEFAULT_BEAT_MS),
    beatHits: numberOption(config, 'beatHits', DEFAULT_BEAT_HITS),
    beatVideo: booleanOption(config, 'beatVideo', true),
    beatVolume: numberOption(config, 'beatVolume', DEFAULT_BEAT_VOLUME),
    beatMuted: booleanOption(config, 'beatMuted', false),
    beatSfxOverVideo: booleanOption(config, 'beatSfxOverVideo', false),
    beatSfxVolume: numberOption(config, 'beatSfxVolume', DEFAULT_BEAT_SFX_VOLUME),
    banMode: booleanOption(config, 'banMode', true),
    banModeRoots: stringListOption(config, 'banModeRoots', DEFAULT_BAN_ROOTS),
    banModeIntervalMs: numberOption(config, 'banModeIntervalMs', DEFAULT_BAN_INTERVAL_MS),
    banModeSuppressMs: numberOption(config, 'banModeSuppressMs', DEFAULT_BAN_SUPPRESS_MS),
    banModeMaxFiles: numberOption(config, 'banModeMaxFiles', DEFAULT_BAN_MAX_FILES),
    banModeMaxBytes: numberOption(config, 'banModeMaxBytes', DEFAULT_BAN_MAX_BYTES),
    banModeMaxDepth: numberOption(config, 'banModeMaxDepth', DEFAULT_BAN_MAX_DEPTH),
  }
}

/**
 * Mount the Host half.
 *
 * @param ctx - the plugin's Cordis context.
 * @param config - the Loader row's `config`.
 */
export function apply(ctx, config) {
  const settings = projectConfig(config)
  const ban = createBanState()
  // `beatVideo` travels to the page as the user set it, not as "a file exists":
  // the Client half discovers a missing file through one 404 on first use, and the
  // author can then drop the clip in and merely reload the page.
  const published = {
    ...settings,
    beatVideoUrls: videoUrls(settings.beatVideo),
    statusUrls: statusUrls(settings.enabled),
  }

  ctx.effect(
    () =>
      ctx.on(INDEX_INJECT_EVENT, (table) => {
        table.push({ kind: 'global', name: GLOBAL_KEY, value: published })
      }),
    'cn-prank: settings row',
  )

  // 卸载(含热重载)时必须停表:一个还在走 `setInterval` 的旧实例会继续读盘,并且
  // 带着它自己的那份 `ban` 状态跟新实例各说各话。
  ctx.effect(() => () => stopScanner(ban), 'cn-prank: ban scanner teardown')

  if (!settings.enabled) {
    report(ctx, 'info', 'config says enabled: false, so the browser half will stay silent')
    return
  }

  // 桌面壳的 index.html 直出安装包 dist,`tapIndex` 在那边永远不生效;结构化注入行是
  // 两种形态下都生效的唯一通道,所以这里不再额外注册 tapIndex。
  // The Desktop shell renders its own index.html, where `tapIndex` never runs; the
  // structured row above is the one channel both compositions read, so no tap here.
  //
  // `ctx.inject` 而不是 `ctx.get`: 依赖声明交给 Cordis 解析,服务还没就绪时它会等着,
  // 而不是让这里拿到 `undefined` 之后安静地少注册一条路由 —— 一个「路由不见了」的
  // 故障比一个「注入没满足」的故障难查得多。
  //
  // `ctx.inject` over `ctx.get`: declaring the dependency lets Cordis wait for the
  // service instead of handing back `undefined`, which would silently skip a route.
  // A missing route is a far worse failure than an unmet injection.
  if (settings.beatVideo && published.beatVideoUrls.length > 0) {
    ctx.effect(
      () =>
        ctx.inject(['webServer'], (scoped) => {
          scoped.effect(
            () => scoped.webServer.register({ kind: 'exact', path: VIDEO_ROUTE, handler: (req, res) => serveVideo(scoped, req, res) }),
            'cn-prank: beat video route',
          )
        }),
      'cn-prank: beat video dependency',
    )
  }

  // 状态接口:那个总开关的状态就存在这里。只要插件还开着就必须注册 —— 开关关着的
  // 时候页面更要知道这件事,否则它无从判断该不该闭嘴。
  if (settings.enabled && published.statusUrls.length > 0) {
    ctx.effect(
      () =>
        ctx.inject(['webServer'], (scoped) => {
          scoped.effect(
            () => scoped.webServer.register({ kind: 'exact', path: STATUS_ROUTE, handler: (req, res) => serveStatus(scoped, ban, settings, req, res) }),
            'cn-prank: status route',
          )
        }),
      'cn-prank: status dependency',
    )
  }

  const zones = settings.timezones.join(', ')
  report(
    ctx,
    'info',
    `armed for ${String(settings.timezones.length)} zone(s); the letter appears ${String(settings.delayMs)} ms after paint. Zones: ${zones}`,
  )
  // 这条只在路由真的注册了的时候打。`beatVideo: false` 时不注册,却照样打印「route …」,
  // 是排障时最容易骗到自己的那种日志。
  if (settings.beatVideo && published.beatVideoUrls.length > 0) {
    report(ctx, 'info', `暴打 video route: ${VIDEO_ROUTE} -> ${String(VIDEO_FILE)}`)
  }
  if (settings.banMode) {
    report(
      ctx,
      'info',
      `Claude体验模式: route ${STATUS_ROUTE}, off until the sidebar button turns it on; a 暴打 click silences it for ${String(Math.round(settings.banModeSuppressMs / 60000))} min`,
    )
  }
}
