/**
 * 网页半侧测试:不装浏览器,把 client.js 放进 vm,验证纯函数与模块注册格式。
 *
 * 弹窗/DOM 部分靠 test/harness.html 在真浏览器里看,这里只守住"认哪颗按钮"
 * 和"模块 id/slot 形状"这两件容易悄悄坏掉的事。
 *
 *   node test/pure.test.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(here, '..', 'client.js'), 'utf8')

let captured = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(definition) {
        captured = definition
      },
    },
  },
  console,
}
vm.runInNewContext(code, sandbox)

assert.notEqual(captured, null, 'bundle 没有调用 window.__ModuleLoader__.load')
assert.equal(captured.id, 'dsh-plugin-pause-prank')
assert.equal(typeof captured.factory, 'function')

const moduleExports = captured.factory()
// 跨 vm realm 的对象原型不同,deepEqual 会嫌"结构一样但不是同一个 Array"。
// 这里关心的只是形状,JSON 比较足够。
assert.equal(JSON.stringify(moduleExports.inject), '[]')
assert.equal(typeof moduleExports.apply, 'function')

// 没有 document 时 apply 应该安静退出,而不是抛错(SSR/预览页会这样)。
moduleExports.apply({ effect: (fn) => fn() })

const t = moduleExports.__test

// ── 停止文案 ──────────────────────────────────────────────────────────────
for (const label of ['停止生成', '停止', 'Stop generating', 'stop', '生成を停止', '중지']) {
  assert.equal(t.isStopLabel(label), true, `应该认作停止: ${label}`)
}
for (const label of ['发送', '排队', 'Send', '', '停止生成并发送']) {
  assert.equal(t.isStopLabel(label), false, `不该认作停止: ${label}`)
}

// ── 发送文案(图标兜底时用来放行) ─────────────────────────────────────────
assert.equal(t.isSendLabel('发送'), true)
assert.equal(t.isSendLabel('排队发送'), true)
assert.equal(t.isSendLabel('send'), true)
assert.equal(t.isSendLabel('停止生成'), false)

// ── 停不停止按钮:认卡片、认文案、认方块图标、拒绝发送/禁用/卡外 ─────────
function fakeButton({ label = '', disabled = false, card = true, rect = null } = {}) {
  const button = {
    disabled,
    getAttribute(name) {
      return name === 'aria-label' ? label : null
    },
    closest(selector) {
      if (selector === 'button') return button
      if (selector === '[data-composer-card]') return card ? {} : null
      return null
    },
    querySelector(selector) {
      return selector === 'svg rect' ? rect : null
    },
  }
  return button
}

const stopByLabel = fakeButton({ label: '停止生成' })
assert.equal(t.isStopButton(stopByLabel), true)
assert.equal(t.stopButtonOf(stopByLabel), stopByLabel)

const stopByIcon = fakeButton({
  label: '',
  rect: { getAttribute: (name) => (name === 'width' || name === 'height' ? '10' : null) },
})
assert.equal(t.isStopButton(stopByIcon), true)

const sendButton = fakeButton({ label: '发送' })
assert.equal(t.isStopButton(sendButton), false)
assert.equal(t.stopButtonOf(sendButton), null)

const disabledStop = fakeButton({ label: '停止生成', disabled: true })
assert.equal(t.isStopButton(disabledStop), false)

const outsideCard = fakeButton({ label: '停止生成', card: false })
assert.equal(t.isStopButton(outsideCard), false)

// 图标兜底不该把发送按钮吃掉。
const sendIcon = fakeButton({
  label: '发送',
  rect: { getAttribute: (name) => (name === 'width' || name === 'height' ? '10' : null) },
})
assert.equal(t.isStopButton(sendIcon), false)

assert.equal(t.stopButtonOf(null), null)
assert.equal(t.stopButtonOf({}), null)

console.log('✓ client: 模块格式、停止按钮识别全部通过')
