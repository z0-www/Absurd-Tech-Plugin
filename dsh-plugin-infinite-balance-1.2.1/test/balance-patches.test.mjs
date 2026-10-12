/**
 * 余额显示适配引擎的验收测试。
 *
 * 设计原则:
 *   - **可移植**:全部夹具都是现场生成的合成文件,不依赖任何机器上的插件路径,
 *     所以 CI(ubuntu)和本机跑的是同一套断言;
 *   - **用真的锚点串**:夹具里写的是目标真实存在的那些调用点,引擎的编辑表必须原样命中,
 *     锚点漂移会被真的测出来;
 *   - **谁用谁清理**:一个独占的临时目录,结束时(含失败时)递归删掉。
 *
 * 本机若装了鲸鱼挂件(`DSH_PROFILE_DIR` 指向它所在 profile),会额外跑一段"金标准"检查:
 * 把已安装文件反推回原版、核对字节数,并确认能干净还原 —— CI 上自动跳过。
 *
 * 用法:`npm test`。
 */
import assert from 'node:assert/strict'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TARGETS,
  applyBalancePatches,
  applyTarget,
  discover,
  patchText,
  revertTarget,
  statusAll,
  statusOf,
  unpatchText,
} from '../balance-patches.js'

let passed = 0
const ok = (label) => {
  passed++
  console.log(`  PASS  ${label}`)
}

/** 独占的临时工作区;调用方负责删。 */
const workspace = mkdtempSync(join(tmpdir(), 'infinite-balance-test-'))
const whale = TARGETS.find((target) => target.id === 'whale')
const bytes = (text) => Buffer.byteLength(text, 'utf8')

/** 造一个"包"目录:相对路径 -> 内容。 */
function makePackage(root, name, files) {
  const dir = join(root, 'node_modules', ...name.split('/'))
  for (const [relative, body] of Object.entries(files)) {
    const parts = relative.split('/')
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true })
    writeFileSync(join(dir, ...parts), body)
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  return dir
}

/**
 * 鲸鱼挂件的合成原版:锚点串与真实文件逐字相同,
 * 数量也相同(插入 1 处、余额调用 10 处、「今日已用」若干处)。
 */
const WIDGET_PRISTINE = [
  'var state = { currency: "CNY", balance: 44.74, todayUsage: 0.48 }',
  'function fmt(balance, currency) { return currency === "CNY" ? "¥" + balance : balance + " " + currency }',
  'function animateAmount(from, to, currency, duration) {',
  '  amountEl.textContent = fmt(to, currency)',
  '  amountEl.textContent = fmt(to, currency)',
  '  amountEl.textContent = fmt(val, currency)',
  '}',
  'function usage() { return (state.todayUsage !== null ? fmt(state.todayUsage, state.currency) : "-") }',
  'function render() {',
  '  a = fmt(shown, state.currency)',
  '  b = fmt(shown, state.currency)',
  '  c = fmt(shown, state.currency)',
  '  d = state.balance === null ? "-" : fmt(state.balance, state.currency)',
  '  e = (function () { return fmt(v, state.currency) })()',
  '  f = (function () { return fmt(Number(v), state.currency) })()',
  '  g = (function () { return fmt(Number(v), state.currency) })()',
  '}',
  '',
].join('\n')

try {
  // ========================================================== 1. 补丁与还原
  console.log('\n[1] 补丁 / 还原 / 只动余额')
  const patched = patchText(whale, WIDGET_PRISTINE, 10)
  assert.equal(unpatchText(whale, patched), WIDGET_PRISTINE, '往返必须逐字符回到原版')
  assert.equal(patched.split('fmtBal(').length - 1, 11, 'fmtBal 应为 1 处定义 + 10 处调用')
  assert.equal(
    patched.split('fmt(state.todayUsage').length - 1,
    WIDGET_PRISTINE.split('fmt(state.todayUsage').length - 1,
    '「今日已用」调用点不能被替换',
  )
  assert.ok(patched.includes(`${whale.banner} threshold=10`), '横幅里必须写明阈值')
  ok('原版 -> 补丁 -> 原版 逐字符一致;只替换 10 处余额调用点,横幅带阈值')

  console.log('\n[2] 注入的 fmtBal() 语义')
  const block = patched.slice(patched.indexOf(whale.banner), patched.indexOf(whale.blockEnd))
  const realFmt = (value, currency) => `${currency}:${value}`
  const build = (text, globalWindow) => new Function('fmt', 'window', `${text}\nreturn fmtBal`)(realFmt, globalWindow)
  const fn = (text, globalWindow, value, currency) => build(text, globalWindow)(value, currency)
  assert.equal(fn(block, {}, 12.34, 'CNY'), '¥ ∞', '高于阈值显示 ¥ ∞')
  assert.equal(fn(block, {}, 3.2, 'CNY'), 'CNY:3.2', '低于阈值走 fmt()')
  assert.equal(fn(block, {}, 10, 'CNY'), 'CNY:10', '等于阈值不算无穷')
  assert.equal(fn(block, {}, 12.34, 'USD'), '∞ USD', '非 CNY 前置 ∞')
  assert.equal(fn(block, { __DSHW_INF_THRESHOLD__: 100 }, 50, 'CNY'), 'CNY:50', '页面覆盖 100 时 50 不是无穷')
  assert.equal(fn(block, { __DSHW_INF_THRESHOLD__: 'abc' }, 12.34, 'CNY'), '¥ ∞', '非法覆盖值回退兜底阈值')
  const patched100 = patchText(whale, WIDGET_PRISTINE, 100)
  const block100 = patched100.slice(patched100.indexOf(whale.banner), patched100.indexOf(whale.blockEnd))
  assert.equal(fn(block100, {}, 50, 'CNY'), 'CNY:50', '兜底 100 时 50 不是无穷')
  assert.equal(fn(block100, {}, 150, 'CNY'), '¥ ∞', '兜底 100 时 150 是无穷')
  new Function(patched)
  ok('阈值判定 / 币种文案 / 页面覆盖 / config 兜底 / 整份文件语法 全部符合预期')

  console.log('\n[3] 锚点失配时整体中止')
  assert.throws(() => patchText(whale, WIDGET_PRISTINE.replace('fmt(shown, state.currency)', 'fmt(shownX, state.currency)'), 10), /锚点失配/)
  assert.throws(() => patchText(whale, WIDGET_PRISTINE.replace(whale.blockEnd, 'function gone('), 10), /锚点失配/)
  assert.throws(() => unpatchText(whale, WIDGET_PRISTINE), /找不到/)
  ok('调用点 / 区块锚点不符,以及"拿原版去还原" -> 全部抛错,不产出半成品')

  // ========================================================== 2. 目标状态机
  console.log('\n[4] 一个目标的完整状态机')
  const profile = join(workspace, 'profile')
  const packageDir = makePackage(profile, 'dsh-whale-widget', { 'assets/whale-widget.js': WIDGET_PRISTINE })
  const file = join(packageDir, 'assets', 'whale-widget.js')
  const env = { DSH_PROFILE_DIR: profile, DSH_HOME: join(workspace, 'home') }
  const backups = join(workspace, 'home', '.infinite-balance', 'backups')

  const noTarget = { DSH_PROFILE_DIR: join(workspace, 'none') }
  assert.equal(statusOf(whale, noTarget).state, 'absent')
  assert.equal(applyTarget(whale, { env: noTarget, threshold: 10 }).action, 'absent')
  ok('没装 -> status absent / apply absent(都不报错)')

  assert.equal(applyTarget(whale, { env, threshold: 10 }).action, 'applied')
  assert.equal(statusOf(whale, env).state, 'patched')
  assert.ok(existsSync(join(backups, 'dsh-whale-widget.1.0.0.whale.bak')), '应写出原版备份')
  assert.equal(readdirSync(join(packageDir, 'assets')).filter((name) => name.includes('.tmp')).length, 0, '不应留临时文件')
  ok('原版 -> applied,状态 patched,备份落盘,无临时残留')

  assert.equal(applyTarget(whale, { env, threshold: 10 }).action, 'already')
  ok('再跑一次 -> already(不写盘)')

  assert.equal(applyTarget(whale, { env, threshold: 100 }).action, 'retuned')
  assert.equal(statusOf(whale, env).threshold, 100)
  assert.equal(unpatchText(whale, readFileSync(file, 'utf8')), WIDGET_PRISTINE, '重打后仍可干净还原')
  ok('阈值 10 -> 100 -> retuned,且仍可干净还原')

  // 早期版本会把横幅里的阈值写丢;这种文件必须被修好,而不是被当成"已在位"。
  const lostThreshold = readFileSync(file, 'utf8').replace('threshold=100', '')
  writeFileSync(file, lostThreshold)
  const repaired = applyTarget(whale, { env, threshold: 10 })
  assert.equal(repaired.action, 'repaired', repaired.message)
  assert.ok(readFileSync(file, 'utf8').includes(`${whale.banner} threshold=10`), '修复后横幅必须带阈值')
  assert.equal(unpatchText(whale, readFileSync(file, 'utf8')), WIDGET_PRISTINE, '修复后仍可干净还原')
  assert.equal(applyTarget(whale, { env, threshold: 10 }).action, 'already')
  ok('横幅漏了阈值 -> repaired(而不是反复重打)')

  // 外挂脚本(apply.mjs)打的旧式横幅:先还原再升级。用合成的 v1 复现:
  // 只换掉横幅(调用点仍是 fmtBal),这正是 v1 的样子。
  const legacy = readFileSync(file, 'utf8').replace(`${whale.banner} threshold=10`, '// [∞ patch] 旧版外挂补丁')
  writeFileSync(file, legacy)
  assert.equal(statusOf(whale, env).state, 'patched-legacy')
  assert.equal(applyTarget(whale, { env, threshold: 10 }).action, 'upgraded')
  assert.equal(unpatchText(whale, readFileSync(file, 'utf8')), WIDGET_PRISTINE, '升级后还原等于原版')
  ok('旧式横幅(v1) -> upgraded,且还原等于原版')

  const damaged = WIDGET_PRISTINE.replace('fmt(shown, state.currency)', 'fmt(shownX, state.currency)')
  writeFileSync(file, damaged)
  const failed = applyTarget(whale, { env, threshold: 10 })
  assert.equal(failed.ok, false)
  assert.equal(failed.action, 'failed')
  assert.equal(readFileSync(file, 'utf8'), damaged, '失败时文件必须原样不动')
  ok('锚点漂移 -> failed,文件一个字节都没动')

  writeFileSync(file, WIDGET_PRISTINE)
  applyTarget(whale, { env, threshold: 10 })
  assert.equal(revertTarget(whale, { env }).action, 'reverted')
  assert.equal(readFileSync(file, 'utf8'), WIDGET_PRISTINE)
  ok('--revert -> 逐字符回到原版')

  // 目标文件是硬链接时,不能顺着链接改坏源文件(这就是"改名而非就地覆写"的理由)。
  const storeCopy = join(workspace, 'store-copy.js')
  writeFileSync(storeCopy, WIDGET_PRISTINE)
  rmSync(file, { force: true })
  linkSync(storeCopy, file)
  assert.equal(applyTarget(whale, { env, threshold: 10 }).action, 'applied')
  assert.equal(readFileSync(storeCopy, 'utf8'), WIDGET_PRISTINE, 'store 那份必须一个字节没变')
  ok('硬链接:目标被改,store 源文件完好')

  // ========================================================== 3. 适配表
  console.log('\n[5] 适配表:加一条声明就生效(含作用域包名的备份命名)')
  const synthetic = {
    id: 'fixture',
    package: '@fixture/widget',
    file: 'assets/widget.js',
    banner: '// [inf-balance fixture v1]',
    thresholdPattern: /threshold=([0-9.]+)/,
    legacy: [],
    blockEnd: 'function renderMain() {',
    block: ['{{banner}}', 'function fmtBal(value) {', '  if (Number(value) > {{threshold}}) return "∞"', '  return fmt(value)', '}', ''].join('{{eol}}'),
    edits: [
      { find: 'function renderMain() {', replace: '{{block}}function renderMain() {', count: 1, inject: true },
      { find: 'el.textContent = fmt(balance)', replace: 'el.textContent = fmtBal(balance)', count: 2 },
    ],
  }
  const syntheticPristine = [
    'function fmt(value) { return "¥" + value }',
    'function renderMain() {',
    '  el.textContent = fmt(balance)',
    '  el.textContent = fmt(balance)',
    '}',
    '',
  ].join('\n')
  const profileTwo = join(workspace, 'profile-two')
  const packageTwo = makePackage(profileTwo, '@fixture/widget', { 'assets/widget.js': syntheticPristine })
  const fileTwo = join(packageTwo, 'assets', 'widget.js')
  const envTwo = { DSH_PROFILE_DIR: profileTwo, DSH_HOME: join(workspace, 'home-two') }

  TARGETS.push(synthetic)
  const results = applyBalancePatches({ env: envTwo, threshold: 42 })
  assert.equal(results.length, 2, '适配表里的目标都要跑到')
  assert.equal(results.find((entry) => entry.id === 'fixture').action, 'applied')
  assert.equal(results.find((entry) => entry.id === 'whale').action, 'absent')
  assert.ok(readFileSync(fileTwo, 'utf8').includes('threshold=42'), '阈值要写进横幅')
  assert.equal(statusOf(synthetic, envTwo).threshold, 42)
  assert.equal(unpatchText(synthetic, readFileSync(fileTwo, 'utf8')), syntheticPristine, '新目标同样可干净还原')
  assert.ok(
    existsSync(join(envTwo.DSH_HOME, '.infinite-balance', 'backups', '@fixture+widget.1.0.0.fixture.bak')),
    '作用域包名的备份文件名不能含路径分隔符',
  )
  assert.equal(applyTarget(synthetic, { env: envTwo, threshold: 77 }).action, 'retuned')
  const drifted = syntheticPristine.replace('  el.textContent = fmt(balance)\n', '  el.textContent = fmtAmount(balance)\n')
  assert.notEqual(drifted, syntheticPristine, '漂移夹具应真的改了文本')
  writeFileSync(fileTwo, drifted)
  assert.equal(applyTarget(synthetic, { env: envTwo, threshold: 10 }).action, 'failed')
  assert.equal(readFileSync(fileTwo, 'utf8'), drifted, '锚点漂移时不许写盘')
  ok('声明即生效:新目标被打上、阈值写入、可还原、备份名安全;漂移则拒绝写盘')

  // ========================================================== 4. 发现报告
  console.log('\n[6] --discover:只读、不误报、同一文件只报一条')
  const discoverProfile = join(workspace, 'discover-profile')
  const discoverRoot = join(discoverProfile, 'node_modules')
  makePackage(discoverProfile, 'fake-balance-ui', {
    'client.js': 'function formatBalance(a, s) { return s + a.toFixed(2) }\nconst r = await ctx.remote.account.getBalance({})\nconst s = "¥"\n',
  })
  makePackage(discoverProfile, 'dsh-whale-widget', {
    'assets/whale-widget.js': 'const sym = "¥"\nfunction fmt(v) { return sym + v.toFixed(2) }\n',
  })
  makePackage(discoverProfile, 'plain-plugin', { 'client.js': 'export const nothing = 1\n' })
  // 同一个文件被 manifest 与 exports 各声明一次:报告里只能出现一条。
  const dupDir = makePackage(discoverProfile, 'dup-ui', {
    'client.js': 'const money = "¥"\nfunction show(a) { return money + a.toFixed(2) }\n',
  })
  const dupManifest = JSON.parse(readFileSync(join(dupDir, 'package.json'), 'utf8'))
  dupManifest.dsh = { client: { platform: 'web', entry: './client.js' } }
  dupManifest.exports = { './client': './client.js' }
  writeFileSync(join(dupDir, 'package.json'), JSON.stringify(dupManifest))

  const firstRead = readFileSync(join(discoverRoot, 'fake-balance-ui', 'client.js'), 'utf8')
  const findings = discover({ env: { DSH_PROFILE_DIR: discoverProfile } })
  const fake = findings.find((finding) => finding.package === 'fake-balance-ui')
  assert.ok(fake !== undefined, '应认出显示余额的插件')
  assert.ok(fake.signals.length >= 3, `三种命中都要报出来: ${JSON.stringify(fake.signals)}`)
  assert.ok(fake.formatters.includes('formatBalance'), `应猜出格式化函数名: ${JSON.stringify(fake.formatters)}`)
  assert.equal(fake.covered, undefined, '未覆盖的候选 covered 必须是 undefined')
  assert.equal(findings.find((finding) => finding.package === 'dsh-whale-widget').covered, 'whale', '已覆盖的要标出来')
  assert.equal(findings.some((finding) => finding.package === 'plain-plugin'), false, '无关插件不许误报')
  assert.equal(findings.filter((finding) => finding.package === 'dup-ui').length, 1, '同一文件只能报一条')
  assert.equal(readFileSync(join(discoverRoot, 'fake-balance-ui', 'client.js'), 'utf8'), firstRead, '发现过程不许写盘')
  ok('认出候选、标出已覆盖、无误报、同一文件不重复,全程零写入')

  // ========================================================== 5. 金标准(仅本机有真挂件时)
  console.log('\n[7] 金标准检查(装了真鲸鱼才跑)')
  const realRoot = process.env.DSH_PROFILE_DIR
  const realFile = realRoot === undefined ? undefined : join(realRoot, 'node_modules', 'dsh-whale-widget', 'assets', 'whale-widget.js')
  if (realFile === undefined || !existsSync(realFile)) {
    console.log('  SKIP  本机没有已安装的鲸鱼挂件(CI 上正常)')
  } else {
    const installed = readFileSync(realFile, 'utf8')
    const pristine = unpatchText(whale, installed)
    assert.ok(!pristine.includes('fmtBal'), '原版不应含 fmtBal')
    assert.equal(unpatchText(whale, patchText(whale, pristine, 10)), pristine, '真原版的往返必须逐字符一致')
    // 版本相关的字节数只在对应版本上断言,换版本时不会误报。
    let version = 'unknown'
    try {
      version = JSON.parse(readFileSync(join(realFile, '..', '..', 'package.json'), 'utf8')).version
    } catch {
      /* 读不到就不断言字节数 */
    }
    if (version === '0.3.18') {
      assert.equal(bytes(pristine), 861966, '0.3.18 的原版应为 861966 字节')
      console.log(`  0.3.18 原版字节数核对通过(${bytes(pristine)})`)
    }
    ok(`真挂件 ${bytes(installed)} 字节 -> 反推原版 ${bytes(pristine)} 字节,往返一致`)
  }

  console.log(`\n全部通过:${passed} 组断言`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
