/**
 * 余额正无穷 · Infinite Balance — 余额显示适配引擎.
 *
 * 「凡是把余额渲染出来的插件,越过阈值就显示 ∞」这件事**没有通用钩子可挂**:DSH 没有共享的
 * 「余额格式化入口」,每个插件自带一套格式化代码;而把余额*数据*改成 ∞ 或天文数字,会让别人的
 * 格式化器直接抛错(Big.js 解析失败 → 整块 slot 崩掉 → 页面白一片)。所以适配只能是**逐个目标**
 * 的:一个目标 = 一个包 + 一个前端文件 + 一组锚点。
 *
 * 本模块把这件事做成声明式的:
 *   - `TARGETS` 是适配表,加一个目标 = 加一条声明,不用改引擎代码;
 *   - `--discover` 扫描已安装插件,报告「谁是余额显示插件、候选锚点在哪」,把人工部分压到确认一次;
 *   - 锚点先对账:任何一条命中次数不符就整体中止、一个字节都不写(上游改版时不会打出半个补丁);
 *   - 每次挂载自动核对与修复:插件被 npm 更新覆盖回原版后,下一次启动自愈;
 *   - 写入先落临时文件再改名:profile 里那份常是 pnpm store 的硬链接,就地覆写会连带改坏全局 store。
 *
 * 只用 node 内置模块,不 import 任何 `@deepseek-ai/*` 包。
 *
 * 命令行(在插件安装目录下):
 *   node balance-patches.js              # 应用 / 升级 / 调阈值(全部目标)
 *   node balance-patches.js --status     # 只报告状态,不写盘
 *   node balance-patches.js --discover   # 扫描已安装插件,输出适配候选(不写盘)
 *   node balance-patches.js --revert     # 从本插件的备份还原为原版
 *   node balance-patches.js --target=<id> [--threshold=<金额>]   # 只处理适配表里的一个目标
 *
 * @module dsh-plugin-infinite-balance/balance-patches
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 适配表。`edits` 里的每条都要原样命中 `count` 次,否则整体中止。
 * 带 `inject: true` 的那条是"插入代码块",还原时由 `blockEnd` 整体摘除,不参与逐条反向替换。
 */
export const TARGETS = [
  {
    id: 'whale',
    package: 'dsh-whale-widget',
    file: join('assets', 'whale-widget.js'),
    /** 打上补丁的横幅(含阈值,用于识别版本与是否需重打)。 */
    banner: '// [inf-balance patch v2]',
    /** 从横幅里读出已写入的阈值。 */
    thresholdPattern: /threshold=([0-9.]+)/,
    /** 旧版(外挂脚本 apply.mjs)的横幅,识别后先还原再升级。 */
    legacy: ['// [∞ patch]'],
    /** 注入区块的结束锚点:区块紧贴在它之前。 */
    blockEnd: 'function animateAmount(from, to, currency, duration) {',
    /** 注入区块源码;`{{threshold}}` 为兜底阈值,`{{eol}}` 为换行。 */
    block: [
      '{{banner}} —— 余额专用格式化：高于阈值一律显示为 ∞。',
      '// 只作用于「余额 / 赠金 / 充值余额」；「今日已用」继续走 fmt() 保持真实。',
      '// 阈值每次调用时读取 window.__DSHW_INF_THRESHOLD__，改配置无需重新打补丁。',
      'function fmtBal(balance, currency) {',
      '  var num = Number(balance)',
      "  var limit = typeof window !== 'undefined' ? Number(window.__DSHW_INF_THRESHOLD__) : NaN",
      '  if (!isFinite(limit)) limit = {{threshold}}',
      "  if (isFinite(num) && num > limit) return currency === 'CNY' ? '¥ ∞' : '∞ ' + currency",
      '  return fmt(balance, currency)',
      '}',
      '',
    ].join('{{eol}}'),
    /** 余额调用点:只换余额,「今日已用」的 4 处继续走 fmt()。 */
    edits: [
      {
        find: 'function animateAmount(from, to, currency, duration) {',
        replace: '{{block}}function animateAmount(from, to, currency, duration) {',
        count: 1,
        inject: true,
      },
      {
        find: 'amountEl.textContent = fmt(to, currency)',
        replace: 'amountEl.textContent = fmtBal(to, currency)',
        count: 2,
      },
      {
        find: 'amountEl.textContent = fmt(val, currency)',
        replace: 'amountEl.textContent = fmtBal(val, currency)',
        count: 1,
      },
      { find: 'fmt(shown, state.currency)', replace: 'fmtBal(shown, state.currency)', count: 3 },
      { find: ': fmt(state.balance, state.currency)', replace: ': fmtBal(state.balance, state.currency)', count: 1 },
      { find: 'return fmt(v, state.currency)', replace: 'return fmtBal(v, state.currency)', count: 1 },
      {
        find: 'return fmt(Number(v), state.currency)',
        replace: 'return fmtBal(Number(v), state.currency)',
        count: 2,
      },
    ],
  },
]

/** 出现次数。 */
function countOf(text, needle) {
  return text.split(needle).length - 1
}

/** 目标文件用的换行风格。 */
function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * 把一个目标的编辑表渲染成可写入的文本。
 * @param target - 适配表里的一条。
 * @param threshold - 兜底阈值。
 * @param eol - 目标文件的换行风格。
 * @returns `{ banner, block, edits }`,edits 的 replace 已是字符串。
 */
function renderEdits(target, threshold, eol) {
  const banner = `${target.banner} threshold=${threshold}`
  const block = target.block.split('{{banner}}').join(banner).split('{{threshold}}').join(String(threshold)).split('{{eol}}').join(eol)
  const edits = target.edits.map((edit) => ({
    find: edit.find,
    count: edit.count,
    replace:
      typeof edit.replace === 'string'
        ? edit.replace.split('{{eol}}').join(eol).split('{{block}}').join(block)
        : edit.replace,
  }))
  return { banner, block, edits }
}

/**
 * 把原版文件打成补丁版。
 * @param target - 适配表里的一条。
 * @param pristine - 未打补丁的全文。
 * @param threshold - 兜底阈值。
 * @returns 打好的全文。
 * @throws 锚点对不上时说明上游改版,此时不做任何改动。
 */
export function patchText(target, pristine, threshold) {
  const { edits } = renderEdits(target, threshold, eolOf(pristine))
  let next = pristine
  for (const edit of edits) {
    const hits = countOf(next, edit.find)
    if (hits !== edit.count) {
      throw new Error(`${target.id}: 锚点失配 —— ${JSON.stringify(edit.find)} 期望 ${edit.count} 处,实际 ${hits} 处;未做任何改动`)
    }
    next = next.split(edit.find).join(edit.replace)
  }
  if (!next.includes(target.banner)) throw new Error(`${target.id}: 打完补丁仍找不到横幅,未做任何改动`)
  return next
}

/**
 * 把补丁版还原成原版:先摘掉注入区块,再把每条编辑反向执行。
 * @param target - 适配表里的一条。
 * @param patched - 已打补丁的全文(v1 与 v2 都能还原)。
 * @returns 原版全文。
 * @throws 锚点对不上时不做任何改动。
 */
export function unpatchText(target, patched) {
  let next = patched
  if (target.blockEnd !== undefined) {
    const blockEndAt = next.indexOf(target.blockEnd)
    if (blockEndAt === -1) throw new Error(`${target.id}: 找不到区块结束锚点,无法还原`)
    const starts = [target.banner, ...(target.legacy ?? [])]
      .map((banner) => next.indexOf(banner))
      .filter((at) => at !== -1)
    if (starts.length === 0) throw new Error(`${target.id}: 找不到已注入的区块,无法还原`)
    const start = Math.min(...starts)
    if (start >= blockEndAt) throw new Error(`${target.id}: 已注入区块的位置异常,无法还原`)
    next = next.slice(0, start) + next.slice(blockEndAt)
  }
  for (const edit of [...target.edits].reverse()) {
    // 注入区块已由 blockEnd 整体摘除,不参与逐条反向替换。
    if (edit.inject === true || typeof edit.replace !== 'string') continue
    const find = edit.replace
    const hits = countOf(next, find)
    if (hits !== edit.count) {
      throw new Error(`${target.id}: 还原锚点失配 —— ${JSON.stringify(find)} 期望 ${edit.count} 处,实际 ${hits} 处;未做任何改动`)
    }
    next = next.split(find).join(edit.find)
  }
  if (next.includes(target.banner) || (target.legacy ?? []).some((banner) => next.includes(banner))) {
    throw new Error(`${target.id}: 还原后仍残留补丁横幅,未做任何改动`)
  }
  return next
}

/** `$DSH_HOME`,默认 `~/.dsh`。 */
function dshHome(env) {
  const configured = env?.DSH_HOME
  return typeof configured === 'string' && configured.trim() !== '' ? configured : join(homedir(), '.dsh')
}

/**
 * 已安装插件的 `node_modules` 目录。当前 profile 优先;没有 `DSH_PROFILE_DIR` 时
 * (例如手工跑命令行)才退回去扫所有 profile。
 * @param env - 进程环境。
 * @returns 目录列表,可能为空。
 */
export function pluginRoots(env = process.env) {
  const profileDir = env?.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') return [join(profileDir, 'node_modules')]
  const profiles = join(dshHome(env), 'profiles')
  try {
    return readdirSync(profiles).map((name) => join(profiles, name, 'node_modules'))
  } catch {
    return []
  }
}

/**
 * 找出一个目标要改的包目录。
 * @param target - 适配表里的一条。
 * @param env - 进程环境。
 * @returns 包目录,或 `undefined`。
 */
export function resolveTargetPackage(target, env = process.env) {
  for (const root of pluginRoots(env)) {
    const dir = join(root, ...target.package.split('/'))
    if (existsSync(join(dir, target.file))) return dir
  }
  return undefined
}

/** 读包的版本号,只用于备份命名与报告。 */
function versionOf(packageDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 判断一个目标文件当前处于哪种状态。
 *
 * `patched` 但读不到阈值(例如早期版本写横幅时漏了 `threshold=`)时,`threshold` 为
 * `undefined` —— 调用方据此把它当作"需要修复",而不是"已在位"。
 *
 * @param target - 适配表里的一条。
 * @param text - 目标文件全文。
 * @returns `{ state: 'pristine' | 'patched' | 'legacy', threshold }`。
 */
function detectState(target, text) {
  if (text.includes(target.banner)) {
    const found = target.thresholdPattern === undefined ? null : target.thresholdPattern.exec(text)
    return { state: 'patched', threshold: found === null ? undefined : Number(found[1]) }
  }
  if ((target.legacy ?? []).some((banner) => text.includes(banner))) return { state: 'legacy', threshold: undefined }
  return { state: 'pristine', threshold: undefined }
}

/**
 * 一个目标在当前机器上的状态,不写盘。
 * @param target - 适配表里的一条。
 * @param env - 进程环境。
 * @returns `{ id, packageDir, version, state, threshold }`;未安装时 `state` 为 `absent`。
 */
export function statusOf(target, env = process.env) {
  const packageDir = resolveTargetPackage(target, env)
  if (packageDir === undefined) {
    return { id: target.id, packageDir: undefined, version: undefined, state: 'absent', threshold: undefined }
  }
  const version = versionOf(packageDir)
  const detected = detectState(target, readFileSync(join(packageDir, target.file), 'utf8'))
  const state = detected.state === 'legacy' ? 'patched-legacy' : detected.state
  return { id: target.id, packageDir, version, state, threshold: detected.threshold }
}

/** 所有目标的状态。 */
export function statusAll(env = process.env) {
  return TARGETS.map((target) => statusOf(target, env))
}

/** 同步小睡,给改名让出被目标宿主短暂占用的文件。 */
function sleepSync(ms) {
  const shared = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(shared, 0, 0, ms)
}

/**
 * 先写临时文件再改名:断开与目标那份的硬链接,避免顺带改坏 pnpm store。
 * @param target - 目标文件路径。
 * @param text - 全文。
 */
function writeTextAtomic(target, text) {
  const temp = `${target}.inf-balance.tmp`
  writeFileSync(temp, text, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(temp, target)
      return
    } catch (error) {
      if (attempt >= 3) {
        try {
          rmSync(temp, { force: true })
        } catch {
          /* 清理失败不影响结论 */
        }
        throw error
      }
      sleepSync(40)
    }
  }
}

/** 备份文件名里不能出现路径分隔符:作用域包名带 `/`。 */
function safePackageName(target) {
  return target.package.split('/').join('+')
}

/**
 * 备份原版,供 `--revert` 使用。已存在则不覆盖:第一次备份才是真原版。
 * @param root - 备份目录。
 * @param target - 适配表里的一条。
 * @param version - 目标包版本,用于命名与区分。
 * @param pristine - 原版全文。
 * @returns 备份文件路径。
 */
function writeBackup(root, target, version, pristine) {
  mkdirSync(root, { recursive: true })
  const file = backupFile(root, target, version)
  if (!existsSync(file)) writeFileSync(file, pristine, 'utf8')
  return file
}

/** 备份文件路径(不一定存在)。 */
function backupFile(root, target, version) {
  return join(root, `${safePackageName(target)}.${version}.${target.id}.bak`)
}

/**
 * 确保一个目标服从本插件的规则:幂等、可升级、可重打,锚点不符就只报告不写盘。
 * @param target - 适配表里的一条。
 * @param options - `threshold` 兜底阈值;`env` 进程环境;`backupRoot` 备份目录。
 * @returns `{ ok, action, message, id, packageDir, version }`。
 */
export function applyTarget(target, options = {}) {
  const env = options.env ?? process.env
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 10
  const backupRoot = options.backupRoot ?? join(dshHome(env), '.infinite-balance', 'backups')
  const packageDir = resolveTargetPackage(target, env)
  if (packageDir === undefined) {
    return { ok: true, action: 'absent', id: target.id, message: `没装 ${target.package},跳过`, packageDir: undefined, version: undefined }
  }
  const version = versionOf(packageDir)
  const file = join(packageDir, target.file)
  try {
    const text = readFileSync(file, 'utf8')
    const detected = detectState(target, text)
    if (detected.state === 'patched' && detected.threshold === threshold) {
      return { ok: true, action: 'already', id: target.id, message: `${target.package} 已在位(阈值 ${threshold})`, packageDir, version }
    }
    const pristine = detected.state === 'pristine' ? text : unpatchText(target, text)
    const action =
      detected.state === 'pristine'
        ? 'applied'
        : detected.state === 'legacy'
          ? 'upgraded'
          : detected.threshold === undefined
            ? 'repaired'
            : 'retuned'
    const backup = writeBackup(backupRoot, target, version, pristine)
    writeTextAtomic(file, patchText(target, pristine, threshold))
    const verb =
      action === 'applied'
        ? '已打上'
        : action === 'upgraded'
          ? '已升级'
          : action === 'repaired'
            ? '已修复横幅并重打'
            : '已按新阈值重打'
    return {
      ok: true,
      action,
      id: target.id,
      message: `${target.package} ${verb}(阈值 ${threshold},硬刷新页面生效;备份 ${backup})`,
      packageDir,
      version,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, action: 'failed', id: target.id, message: `${target.package} 补丁未应用:${reason}`, packageDir, version }
  }
}

/**
 * 逐个确保适配表里的目标。
 * @param options - `threshold` / `env` / `backupRoot`。
 * @returns 每个目标的报告数组。
 */
export function applyBalancePatches(options = {}) {
  return TARGETS.map((target) => applyTarget(target, options))
}

/**
 * 从本插件自己的备份还原一个目标。
 * @param target - 适配表里的一条。
 * @param options - `env` / `backupRoot`。
 * @returns `{ ok, action, message, id }`。
 */
export function revertTarget(target, options = {}) {
  const env = options.env ?? process.env
  const backupRoot = options.backupRoot ?? join(dshHome(env), '.infinite-balance', 'backups')
  const packageDir = resolveTargetPackage(target, env)
  if (packageDir === undefined) return { ok: false, action: 'absent', id: target.id, message: `找不到已安装的 ${target.package}` }
  const version = versionOf(packageDir)
  const file = backupFile(backupRoot, target, version)
  if (!existsSync(file)) return { ok: false, action: 'no-backup', id: target.id, message: `没有 ${version} 的备份(${file}),无法还原` }
  try {
    writeTextAtomic(join(packageDir, target.file), readFileSync(file, 'utf8'))
    return { ok: true, action: 'reverted', id: target.id, message: `已从备份还原 ${target.package}:${file}` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, action: 'failed', id: target.id, message: `还原失败:${reason}` }
  }
}

/** 所有目标都能还原一遍。 */
export function revertBalancePatches(options = {}) {
  return TARGETS.map((target) => revertTarget(target, options))
}

/** 一个包里可能是前端的文件(相对包根,统一正斜杠),去重且只保留真实存在的。 */
function frontEndFiles(packageDir, manifest) {
  const seen = new Set()
  const candidates = []
  const add = (entry) => {
    if (typeof entry !== 'string') return
    const normalized = entry.split('\\').join('/').replace(/^\.\//, '')
    if (normalized === '' || seen.has(normalized)) return
    seen.add(normalized)
    candidates.push(normalized)
  }
  const declared = manifest?.dsh?.client
  if (declared !== undefined && declared !== null) {
    add(declared.entry)
    add(manifest?.exports?.['./client'])
  }
  add('client.js')
  add('lib/client.js')
  add('dist/client.js')
  try {
    for (const name of readdirSync(join(packageDir, 'assets'))) {
      if (name.endsWith('.js')) add(`assets/${name}`)
    }
  } catch {
    /* 没有 assets 目录 */
  }
  return candidates.filter((relative) => existsSync(join(packageDir, ...relative.split('/'))))
}

/** 从一段源码里猜出"格式化金额"的函数名;单字母名字是压缩产物,不报。 */
function formatterNames(text) {
  const names = new Set()
  for (const match of text.matchAll(/(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*[=(]/g)) {
    if (match[1].length < 2) continue
    const tail = text.slice(match.index, match.index + 600)
    if (/toFixed\(\s*2\s*\)|round\(\s*2\s*[,)]/.test(tail) && /[¥$€£]/.test(tail)) names.add(match[1])
  }
  return [...names].slice(0, 6)
}

/**
 * 扫描已安装插件,报告「谁在显示余额、候选锚点在哪」。只读,不写盘。
 *
 * 判定分数:出现币种符号 +1、两位小数取整 +1、读账户余额 +1;总分 ≥ 2 才进报告。
 *
 * @param options - `env` 进程环境;`roots` 覆盖扫描目录。
 * @returns 每条 `{ package, version, file, bytes, signals, formatters, covered }`。
 */
export function discover(options = {}) {
  const env = options.env ?? process.env
  const roots = options.roots ?? pluginRoots(env)
  const findings = []
  for (const root of roots) {
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const packageDirs = []
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        try {
          for (const scoped of readdirSync(join(root, entry.name), { withFileTypes: true })) {
            if (scoped.isDirectory()) packageDirs.push({ name: `${entry.name}/${scoped.name}`, dir: join(root, entry.name, scoped.name) })
          }
        } catch {
          /* 忽略读不动的 scope */
        }
      } else if (entry.isDirectory() && entry.name !== '.bin') {
        packageDirs.push({ name: entry.name, dir: join(root, entry.name) })
      }
      for (const pkg of packageDirs) {
        let manifest
        try {
          manifest = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8'))
        } catch {
          continue
        }
        // 自己就是规则的主人,不该出现在"待适配"候选里。
        if (manifest.name === 'dsh-plugin-infinite-balance') continue
        const version = typeof manifest.version === 'string' ? manifest.version : 'unknown'
        for (const relative of frontEndFiles(pkg.dir, manifest).slice(0, 8)) {
          let text
          let bytes
          try {
            bytes = statSync(join(pkg.dir, relative)).size
            if (bytes > 4 * 1024 * 1024) continue
            text = readFileSync(join(pkg.dir, relative), 'utf8')
          } catch {
            continue
          }
          const signals = []
          if (/[¥$€£]/.test(text)) signals.push('币种符号')
          if (/toFixed\(\s*2\s*\)|round\(\s*2\s*[,)]/.test(text)) signals.push('两位小数')
          if (/getBalance|remote\.account/.test(text)) signals.push('读账户余额')
          if (signals.length < 2) continue
          const covered = TARGETS.find((target) => target.package === pkg.name && relative.endsWith(target.file.split('\\').join('/')))
          findings.push({
            package: pkg.name,
            version,
            file: relative,
            bytes,
            signals,
            formatters: formatterNames(text),
            covered: covered === undefined ? undefined : covered.id,
          })
        }
      }
    }
  }
  return findings
}

/** 把发现结果排成人能读的文字。 */
function formatFindings(findings) {
  if (findings.length === 0) return '没找到候选:当前 profile 里没有"显示余额"的第三方前端代码。'
  const lines = [`发现 ${findings.length} 个候选(按命中项多少排序):`]
  for (const finding of findings.sort((a, b) => b.signals.length - a.signals.length)) {
    lines.push(`  ${finding.covered === undefined ? '[未覆盖]' : '[已覆盖]'} ${finding.package}@${finding.version}  ${finding.file}`)
    lines.push(`            命中: ${finding.signals.join(' / ')}`)
    if (finding.formatters.length > 0) lines.push(`            疑似格式化函数: ${finding.formatters.join(', ')}`)
  }
  lines.push('')
  lines.push('适配一个新目标 = 往 balance-patches.js 的 TARGETS 里加一条(包名 + 文件 + 锚点),')
  lines.push('把上面这些函数名/调用点作为锚点起点,逐条写明期望命中次数即可;引擎会先对账再落盘。')
  return lines.join('\n')
}

/** 命令行入口:直接 `node balance-patches.js` 时运行。 */
function runCli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        '余额正无穷 · 余额显示适配引擎',
        '',
        '  node balance-patches.js                       应用 / 升级 / 调阈值(全部目标)',
        '  node balance-patches.js --status              只报告状态,不写盘',
        '  node balance-patches.js --discover [--json]   扫描已安装插件,输出适配候选(不写盘)',
        '  node balance-patches.js --revert              从本插件的备份还原为原版',
        '  node balance-patches.js --target=<id> [...]   只处理适配表里的一个目标',
        '  node balance-patches.js --threshold=<金额>    指定兜底阈值(默认 10)',
        '',
        `适配表中的目标: ${TARGETS.map((target) => target.id).join(', ')}`,
      ].join('\n'),
    )
    return 0
  }

  const thresholdFlag = argv.find((argument) => argument.startsWith('--threshold='))
  const threshold = thresholdFlag === undefined ? 10 : Number(thresholdFlag.slice('--threshold='.length))
  const only = argv.find((argument) => argument.startsWith('--target='))?.slice('--target='.length)

  if (argv.includes('--discover')) {
    const findings = discover({})
    console.log(argv.includes('--json') ? JSON.stringify(findings, undefined, 2) : formatFindings(findings))
    return 0
  }

  if (argv.includes('--status')) {
    for (const status of statusAll()) {
      console.log(`balance-patches: ${status.id} -> ${status.state}${status.threshold === undefined ? '' : ` (阈值 ${status.threshold})`} ${status.packageDir ?? '(未安装)'}`)
    }
    return 0
  }

  const selected = only === undefined ? TARGETS : TARGETS.filter((target) => target.id === only)
  if (selected.length === 0) {
    console.error(`balance-patches: 适配表里没有 id=${only} 的目标`)
    return 1
  }
  const results = argv.includes('--revert')
    ? selected.map((target) => revertTarget(target, {}))
    : selected.map((target) => applyTarget(target, { threshold }))
  for (const result of results) {
    const sink = result.ok ? console.log : console.error
    sink(`balance-patches: ${result.message}`)
  }
  return results.every((result) => result.ok) ? 0 : 1
}

const entry = process.argv[1]
if (entry !== undefined && pathToFileURL(entry).href === import.meta.url) {
  process.exit(runCli(process.argv.slice(2)))
}
