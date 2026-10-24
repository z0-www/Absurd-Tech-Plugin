/**
 * 暂停整活 · 真的要说再见吗 — Client half.
 *
 * 这个半侧只做一件事:把输入框那颗「停止生成」按钮的点击,换成一张
 * 「大肥鱼舍不得你走」的拟人暂停确认。
 *
 * 为什么走 DOM 捕获,而不是插槽:
 *   停止按钮是输入框自带的主按钮,官方没有给它留座位。插件能拿到的座位
 *   (conversation.input.* / conversation.composer.dock) 都在它旁边,换不掉它。
 *   于是这里在 window 的捕获阶段先接住点击、拦下 React 的 onClick,弹窗确认后
 *   再把这一下"补发"给原按钮 —— 真正的停止逻辑仍然由官方按钮执行,插件不碰
 *   会话、不碰模型、不碰权限。
 *
 * 怎么认出那颗按钮:
 *   1. 在 `[data-composer-card]` 里面(别处的方块按钮不是我们要拦的);
 *   2. `aria-label` 是 `停止生成` / `Stop generating` 这类本地化文案;或者
 *   3. 兜底:图标是 10×10 的方块(停止图标),且不是发送/排队按钮。
 *
 * 重复挂载:
 *   DSH 的客户端插件热更新可能把同一个 bundle 再 apply 一次而不走卸载。两套
 *   监听器同时在线时,「狠心结束」补发的那一下会被另一套当成新的用户点击再拦
 *   一次,于是点一次弹一次。这里用挂在 window 上的共享运行时
 *   (`__DSH_PAUSE_PRANK_RUNTIME__`)保证同一页面只有一套监听器,bypass 也共享。
 *
 * 图片:
 *   由宿主半侧从磁盘现读(见 index.js 的 /dsh-pause-prank/image),每次打开
 *   都重新请求,所以换完 `assets/persona.png` 再点一次暂停就是新图,不用重启、
 *   不用刷新。
 *
 * @module dsh-plugin-pause-prank/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-pause-prank',
  factory() {
    /** 宿主半侧写进 index 的全局名。 */
    const GLOBAL_KEY = '__DSH_PAUSE_PRANK__'

    /** 同一页面里所有副本共用的运行时,见文件头注释。 */
    const RUNTIME_KEY = '__DSH_PAUSE_PRANK_RUNTIME__'

    /** 预览页/自动化测试用的开关:允许 untrusted 的合成点击被当成用户点击。 */
    const TEST_KEY = '__DSH_PAUSE_PRANK_TEST__'

    /** 宿主没注入配置时的兜底,与 index.js 的默认值一一对应。 */
    const DEFAULTS = {
      enabled: true,
      imageUrl: '/dsh-pause-prank/image',
      imageAlt: 'DeepSeek 娘',
      title: '真的要说再见吗？',
      subtitle: '这一轮才刚开始，白饭还没吃完呢……',
      cruelSubtitle: '要把大肥鱼一个人留在这里吗？',
      kicker: '🐟 大肥鱼食堂 · 暂停确认',
      complainToast: '已记录你的不满，并转交给了大肥鱼 🐟',
    }

    /** 三个主按钮。className 只用于样式区分。 */
    const ACTIONS = {
      cruel: { label: '残忍结束', className: 'dpp-btn dpp-btn-ghost' },
      think: { label: '再想想', className: 'dpp-btn dpp-btn-primary' },
      complain: { label: '我要吐槽', className: 'dpp-btn dpp-btn-link' },
    }

    /**
     * 二级确认。大的「再见」其实会让对话继续,小的「狠心结束」才真的停。
     * 这是整个整活的第二层:看起来最像告别的按钮最不告别。
     */
    const CRUEL_STAGE = {
      goodbye: { label: '再见', className: 'dpp-btn dpp-btn-goodbye' },
      end: { label: '狠心结束', className: 'dpp-btn dpp-btn-end' },
    }

    /** 停止按钮的本地化文案。官方中文是「停止生成」,英文是「Stop generating」。 */
    const STOP_LABELS = [
      '停止生成',
      '停止',
      'stop generating',
      'stop',
      '生成を停止',
      '生成停止',
      '중지',
      '생성 중지',
    ]

    /** 发送侧文案:图标兜底命中它的时候要放行,免得把发送按钮也拦了。 */
    const SEND_LABELS = ['send', 'queue', 'steer', '发送', '排队', '排队发送', '转入排队']

    const CSS = `
.dpp-root {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(9, 15, 30, 0.48);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
  animation: dpp-fade 0.18s ease-out;
}
.dpp-card {
  position: relative;
  width: min(92vw, 620px);
  border-radius: 22px;
  overflow: hidden;
  background: #fff;
  color: #14213d;
  box-shadow:
    0 36px 90px rgba(6, 14, 34, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.4) inset;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  outline: none;
  animation: dpp-pop 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.25);
}
.dpp-hero {
  position: relative;
  aspect-ratio: 27 / 20;
  overflow: hidden;
  background: #eaf2ff;
}
.dpp-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 16%;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
.dpp-hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 16%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), #fff 96%);
  pointer-events: none;
  z-index: 1;
}
.dpp-art-fallback {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-items: center;
  font-size: 74px;
  color: #a9c4f2;
  background: radial-gradient(circle at 50% 35%, #e3edff, #f7faff 70%);
}
.dpp-bubble {
  position: absolute;
  left: 20px;
  top: 20px;
  z-index: 2;
  width: min(296px, 58%);
  padding: 14px 16px 15px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.93);
  box-shadow: 0 14px 34px rgba(26, 55, 110, 0.16);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  line-height: 1.45;
}
.dpp-bubble::after {
  content: "";
  position: absolute;
  right: -11px;
  top: 54%;
  border: 11px solid transparent;
  border-left-color: rgba(255, 255, 255, 0.93);
  border-right: 0;
  border-top-color: transparent;
  border-bottom-color: transparent;
}
.dpp-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  color: #3f6bd6;
}
.dpp-title {
  margin: 0 0 6px;
  font-size: clamp(20px, 4.6vw, 25px);
  line-height: 1.3;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #12213f;
}
.dpp-subtitle {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: #5c6c8d;
}
.dpp-token-chip {
  position: absolute;
  left: 20px;
  bottom: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 9px;
  border-radius: 999px;
  background: rgba(16, 29, 56, 0.68);
  color: #eaf2ff;
  font-size: 11px;
  letter-spacing: 0.02em;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.dpp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6ee7ff;
  box-shadow: 0 0 0 0 rgba(110, 231, 255, 0.7);
  animation: dpp-pulse 1.4s ease-out infinite;
}
.dpp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 20px 2px;
  background: #fff;
}
.dpp-btn {
  height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.dpp-btn:active {
  transform: translateY(1px) scale(0.995);
}
.dpp-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.dpp-btn-ghost {
  flex: none;
  background: #f1f5fb;
  color: #66748f;
}
.dpp-btn-ghost:hover {
  background: #e7edf8;
  color: #3c4b68;
}
.dpp-btn-primary {
  flex: 1;
  background: linear-gradient(180deg, #3f8bfb, #2563eb);
  color: #fff;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.32);
}
.dpp-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.42);
}
.dpp-btn-link {
  flex: none;
  min-width: 68px;
  padding: 0 8px;
  background: transparent;
  color: #93a0b6;
  font-weight: 500;
}
.dpp-btn-link:hover {
  color: #3b82f6;
  text-decoration: underline;
}
.dpp-actions-cruel {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 8px 24px 2px;
}
.dpp-btn-goodbye {
  width: 100%;
  height: 76px;
  padding-left: 0.42em;
  border-radius: 16px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.42em;
  background: linear-gradient(180deg, #4b94ff, #2563eb);
  color: #fff;
  box-shadow: 0 14px 32px rgba(37, 99, 235, 0.4);
  animation: dpp-pop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.dpp-btn-goodbye:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.5);
}
.dpp-btn-end {
  align-self: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: transparent;
  color: #b7c0d0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
}
.dpp-btn-end:hover {
  color: #e26d6d;
  text-decoration: underline;
}
.dpp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 22px 16px;
  background: #fff;
  font-size: 11px;
  color: #a4aec1;
}
.dpp-foot-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dpp-toast {
  position: fixed;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  z-index: 2147483001;
  max-width: min(86vw, 560px);
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(18, 26, 44, 0.94);
  color: #fff;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  animation: dpp-toast-in 0.2s ease-out;
  pointer-events: none;
}
.dpp-toast-out {
  opacity: 0;
  transition: opacity 0.2s ease;
}
@keyframes dpp-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes dpp-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.975); }
  to { opacity: 1; transform: none; }
}
@keyframes dpp-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes dpp-pulse {
  0% { box-shadow: 0 0 0 0 rgba(110, 231, 255, 0.65); }
  70% { box-shadow: 0 0 0 7px rgba(110, 231, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(110, 231, 255, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .dpp-root, .dpp-card, .dpp-toast, .dpp-dot { animation: none; }
  .dpp-btn { transition: none; }
}
@media (max-width: 520px) {
  .dpp-actions { padding: 2px 14px; gap: 6px; }
  .dpp-actions-cruel { padding: 8px 16px 2px; }
  .dpp-btn { height: 42px; padding: 0 12px; font-size: 13px; }
  .dpp-btn-goodbye { height: 64px; font-size: 21px; }
  .dpp-btn-link { min-width: auto; }
  .dpp-bubble { left: 14px; top: 14px; padding: 11px 13px 12px; }
  .dpp-foot { padding: 10px 16px 13px; font-size: 10.5px; }
}
`

    /** 把值夹到 [min, max]。 */
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    /** 取(或建)共享运行时;没有 window 时返回 null。 */
    function sharedRuntime() {
      if (typeof window === 'undefined') return null
      const existing = window[RUNTIME_KEY]
      if (existing !== null && typeof existing === 'object') return existing
      const runtime = { installs: 0, bypass: false, dispose: null }
      window[RUNTIME_KEY] = runtime
      return runtime
    }

    /** 测试模式:预览页要能用 `element.click()` 模拟用户点击。 */
    function isTestMode() {
      return typeof window !== 'undefined' && window[TEST_KEY] === true
    }

    /** 读一次注入配置。宿主每次刷新页面都会重写它,所以只读一次并缓存。 */
    let injected
    function readConfig() {
      if (injected !== undefined) return injected
      const raw = typeof window === 'undefined' ? undefined : window[GLOBAL_KEY]
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const text = (value, fallback) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback)
      injected = {
        enabled: source.enabled !== false,
        imageUrl: text(source.imageUrl, DEFAULTS.imageUrl),
        imageAlt: text(source.imageAlt, DEFAULTS.imageAlt),
        title: text(source.title, DEFAULTS.title),
        subtitle: text(source.subtitle, DEFAULTS.subtitle),
        cruelSubtitle: text(source.cruelSubtitle, DEFAULTS.cruelSubtitle),
        kicker: text(source.kicker, DEFAULTS.kicker),
        complainToast: text(source.complainToast, DEFAULTS.complainToast),
        debug: source.debug === true,
      }
      return injected
    }

    /** 去掉首尾空白后的 aria-label 小写形式。 */
    function labelOf(button) {
      return String(button?.getAttribute?.('aria-label') ?? '').trim().toLowerCase()
    }

    /** 是不是停止按钮的本地化文案。 */
    function isStopLabel(label) {
      const value = String(label ?? '').trim().toLowerCase()
      return STOP_LABELS.includes(value)
    }

    /** 是不是发送/排队侧文案。 */
    function isSendLabel(label) {
      const value = String(label ?? '').trim().toLowerCase()
      return SEND_LABELS.some((candidate) => value === candidate || value.includes(candidate))
    }

    /**
     * 这颗按钮是不是「停止生成」。
     *
     * 只认输入框里的按钮:`[data-composer-card]` 是官方输入框卡片的稳定标记。
     *
     * @param button - 候选按钮。
     * @returns 是就返回 true。
     */
    function isStopButton(button) {
      if (button === null || typeof button !== 'object') return false
      if (button.disabled === true) return false
      if (typeof button.closest !== 'function') return false
      if (button.closest('[data-composer-card]') === null) return false
      if (isStopLabel(labelOf(button))) return true
      // 兜底:停止图标是一个 10×10 的圆角方块,而发送图标是箭头路径。
      const rect = typeof button.querySelector === 'function' ? button.querySelector('svg rect') : null
      if (rect !== null && rect?.getAttribute?.('width') === '10' && rect?.getAttribute?.('height') === '10') {
        return isSendLabel(labelOf(button)) !== true
      }
      return false
    }

    /**
     * 从点击目标往上找停止按钮。
     *
     * @param node - event.target。
     * @returns 停止按钮,或 null。
     */
    function stopButtonOf(node) {
      if (node === null || typeof node !== 'object' || typeof node.closest !== 'function') return null
      const button = node.closest('button')
      return button !== null && isStopButton(button) ? button : null
    }

    /** 小工具:造一个带 class/文本的元素。 */
    function make(tag, className, text) {
      const element = document.createElement(tag)
      if (className !== undefined) element.className = className
      if (text !== undefined) element.textContent = text
      return element
    }

    /**
     * 装上一整套拦截与弹窗。返回卸载函数。
     *
     * 幂等:同一页面里再装一次会先把上一套拆掉(见 RUNTIME_KEY 的注释)。
     *
     * @param config - 已解析配置。
     * @returns 卸载函数。
     */
    function install(config) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
      const runtime = sharedRuntime()
      if (runtime === null) return () => {}

      // 先拆掉同一页面里可能残留的上一套监听器与弹窗。
      runtime.installs += 1
      if (typeof runtime.dispose === 'function') {
        try {
          runtime.dispose()
        } catch {
          /* 旧的一套拆不干净也不能挡住新的一套 */
        }
      }
      runtime.dispose = null
      runtime.bypass = false
      if (config.debug === true) console.info('[pause-prank] install', { installs: runtime.installs })

      const state = {
        overlay: null,
        pendingButton: null,
        lastFocus: null,
        style: null,
        toast: null,
        toastTimer: null,
        toastExitTimer: null,
        // 二级确认用到的节点与状态。
        card: null,
        actionsEl: null,
        subtitleEl: null,
        cruel: false,
      }

      // 样式只进一次;head 还没起来就挂到 documentElement 上。
      if (document.querySelector('style[data-dsh-pause-prank="style"]') === null) {
        const style = document.createElement('style')
        style.setAttribute('data-dsh-pause-prank', 'style')
        style.textContent = CSS
        const host = document.head ?? document.documentElement
        if (host !== null && typeof host.appendChild === 'function') host.appendChild(style)
        state.style = style
      }

      /** 弹一条底部提示。 */
      const toast = (text) => {
        if (typeof text !== 'string' || text.trim() === '') return
        if (state.toastTimer !== null) {
          window.clearTimeout(state.toastTimer)
          state.toastTimer = null
        }
        if (state.toastExitTimer !== null) {
          window.clearTimeout(state.toastExitTimer)
          state.toastExitTimer = null
        }
        if (state.toast !== null) {
          state.toast.remove()
          state.toast = null
        }
        const element = make('div', 'dpp-toast', text)
        element.setAttribute('role', 'status')
        document.body.appendChild(element)
        state.toast = element
        state.toastTimer = window.setTimeout(() => {
          state.toastTimer = null
          element.classList.add('dpp-toast-out')
          state.toastExitTimer = window.setTimeout(() => {
            state.toastExitTimer = null
            element.remove()
            if (state.toast === element) state.toast = null
          }, 220)
        }, 2400)
      }

      /** 关掉弹窗,把焦点还给原来的地方。 */
      const closeDialog = () => {
        const overlay = state.overlay
        state.overlay = null
        state.pendingButton = null
        state.card = null
        state.actionsEl = null
        state.subtitleEl = null
        state.cruel = false
        if (overlay !== null) overlay.remove()
        const focus = state.lastFocus
        state.lastFocus = null
        if (focus !== null && focus.isConnected === true && typeof focus.focus === 'function') {
          try {
            focus.focus()
          } catch {
            /* 焦点是礼貌,不是契约 */
          }
        }
      }

      /** 用户选了某个动作。 */
      const choose = (action) => {
        const button = state.pendingButton
        // 「残忍结束」不会真的结束,它只是把弹窗翻到第二页。
        if (action === 'cruel') {
          showCruelStage()
          return
        }
        closeDialog()
        if (action === 'think') {
          // 「再想想」= 撤销卸载 = 让这一轮继续跑。这正是整活的落点。
          toast('好耶，再吃一碗白饭 🍚')
          return
        }
        if (action === 'complain') {
          toast(config.complainToast)
          return
        }
        if (action === 'goodbye') {
          // 第二页那个特别大的「再见」其实是「再见就是再相见」:关掉弹窗,这一轮继续。
          toast('再见就是再相见，这一轮继续 🍚')
          return
        }
        // 「狠心结束」= 真的停。把这一下补发给官方按钮,由它执行停止。
        if (button !== null && button.isConnected === true && isStopButton(button)) {
          runtime.bypass = true
          try {
            button.click()
          } finally {
            runtime.bypass = false
          }
          toast('狠心结束，大肥鱼会想你的 🐟')
          return
        }
        // 弹窗开着的时候这一轮自己结束了:没有按钮可点,也没什么可停的。
        toast('这一轮已经结束了。')
      }

      /** 造一个动作按钮。 */
      const makeAction = (action) => {
        const meta = ACTIONS[action]
        const button = make('button', meta.className, meta.label)
        button.type = 'button'
        button.dataset.act = action
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          choose(action)
        })
        return button
      }

      /** 画某一页的按钮:第一页三个,第二页一个巨大的「再见」+ 一个极小的「狠心结束」。 */
      const renderActions = (cruel) => {
        const actions = state.actionsEl
        if (actions === null) return
        actions.textContent = ''
        actions.className = cruel ? 'dpp-actions dpp-actions-cruel' : 'dpp-actions'
        if (cruel) {
          const goodbye = make('button', CRUEL_STAGE.goodbye.className, CRUEL_STAGE.goodbye.label)
          goodbye.type = 'button'
          goodbye.dataset.act = 'goodbye'
          goodbye.setAttribute('aria-label', '再见（这一轮继续）')
          goodbye.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            choose('goodbye')
          })
          const end = make('button', CRUEL_STAGE.end.className, CRUEL_STAGE.end.label)
          end.type = 'button'
          end.dataset.act = 'end'
          end.title = '这一次是真的结束'
          end.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            choose('end')
          })
          actions.append(goodbye, end)
          return
        }
        for (const action of ['cruel', 'think', 'complain']) actions.appendChild(makeAction(action))
      }

      /** 翻到第二页:文案换掉,按钮重画,焦点放到那个大按钮上。 */
      const showCruelStage = () => {
        if (state.overlay === null || state.cruel === true) return
        state.cruel = true
        if (state.subtitleEl !== null) state.subtitleEl.textContent = config.cruelSubtitle
        if (state.card !== null) state.card.setAttribute('data-stage', 'cruel')
        renderActions(true)
        const goodbye = state.actionsEl !== null ? state.actionsEl.querySelector('[data-act="goodbye"]') : null
        if (goodbye !== null && typeof goodbye.focus === 'function') {
          try {
            goodbye.focus()
          } catch {
            /* 焦点是礼貌,不是契约 */
          }
        }
      }

      /** 打开弹窗。 */
      const openDialog = (button) => {
        if (state.overlay !== null) return
        // 同一页面永远只允许一张弹窗:哪怕有另一套实例残留,也不叠加。
        if (document.querySelector('[data-dsh-pause-prank="dialog"]') !== null) return
        if (document.body === null) return
        state.pendingButton = button
        state.lastFocus = document.activeElement instanceof Element ? document.activeElement : null

        const root = make('div', 'dpp-root')
        root.setAttribute('data-dsh-pause-prank', 'dialog')

        const card = make('div', 'dpp-card')
        card.tabIndex = -1
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-modal', 'true')
        card.setAttribute('aria-label', config.title)

        const hero = make('div', 'dpp-hero')
        const art = make('img', 'dpp-art')
        art.alt = config.imageAlt
        art.draggable = false
        art.src = config.imageUrl
        art.addEventListener('error', () => {
          if (art.parentNode === hero) art.remove()
          if (hero.querySelector('.dpp-art-fallback') === null) {
            const fallback = make('div', 'dpp-art-fallback', '🐟')
            hero.insertBefore(fallback, hero.firstChild)
          }
        })

        const bubble = make('div', 'dpp-bubble')
        bubble.appendChild(make('div', 'dpp-kicker', config.kicker))
        bubble.appendChild(make('h2', 'dpp-title', config.title))
        const subtitle = make('p', 'dpp-subtitle', config.subtitle)
        bubble.appendChild(subtitle)

        const tokenChip = make('div', 'dpp-token-chip')
        tokenChip.appendChild(make('span', 'dpp-dot'))
        tokenChip.appendChild(make('span', undefined, '词元正在消耗…'))

        hero.append(art, bubble, tokenChip)

        const actions = make('div', 'dpp-actions')
        state.actionsEl = actions
        state.subtitleEl = subtitle
        state.card = card
        state.cruel = false
        renderActions(false)

        const foot = make('div', 'dpp-foot')
        const footLeft = make('span', 'dpp-foot-left', '🍚 大肥鱼正在后台吃白饭')
        const footRight = make('span', undefined, 'Esc 关闭')
        foot.append(footLeft, footRight)

        card.append(hero, actions, foot)
        root.appendChild(card)
        // 滚轮停在弹窗上,别让底下的会话列表跟着滚。
        root.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true })
        document.body.appendChild(root)
        state.overlay = root
        try {
          card.focus()
        } catch {
          /* 焦点是礼貌,不是契约 */
        }
        if (config.debug === true) console.info('[pause-prank] dialog opened', { button })
      }

      /** 捕获阶段接住停止按钮的点击。 */
      const onClickCapture = (event) => {
        if (config.enabled !== true) return
        // 补发给官方按钮的那一下是合成的(untrusted),共享 bypass 让所有副本都放行。
        if (runtime.bypass === true) return
        // 不是用户点出来的合成事件(比如别的脚本 `.click()`),不接管。
        if (event.isTrusted === false && isTestMode() !== true) return
        const target = event.target
        if (target === null || typeof target !== 'object') return
        if (state.overlay !== null && state.overlay.contains(target) === true) return
        const button = stopButtonOf(target)
        if (button === null) return
        event.preventDefault()
        event.stopImmediatePropagation()
        openDialog(button)
      }

      /** 弹窗打开时的键盘:Esc 关闭、Tab 在按钮间转,其余按键不再往下传。 */
      const onKeyDown = (event) => {
        if (state.overlay === null) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopImmediatePropagation()
          closeDialog()
          return
        }
        if (event.key === 'Tab') {
          const focusables = Array.from(state.overlay.querySelectorAll('button')).filter(
            (element) => element.disabled !== true,
          )
          if (focusables.length === 0) return
          event.preventDefault()
          event.stopImmediatePropagation()
          const active = document.activeElement
          const index = focusables.indexOf(active)
          const next = event.shiftKey
            ? (index <= 0 ? focusables.length - 1 : index - 1)
            : (index === -1 || index === focusables.length - 1 ? 0 : index + 1)
          focusables[next].focus()
          return
        }
        // 别让 DSH 的全局快捷键穿过弹窗。
        event.stopPropagation()
      }

      window.addEventListener('click', onClickCapture, true)
      window.addEventListener('keydown', onKeyDown, true)

      const uninstall = () => {
        window.removeEventListener('click', onClickCapture, true)
        window.removeEventListener('keydown', onKeyDown, true)
        if (state.toastTimer !== null) window.clearTimeout(state.toastTimer)
        if (state.toastExitTimer !== null) window.clearTimeout(state.toastExitTimer)
        if (state.toast !== null) state.toast.remove()
        state.toast = null
        if (state.overlay !== null) state.overlay.remove()
        state.overlay = null
        state.pendingButton = null
        if (state.style !== null) state.style.remove()
        state.style = null
        injected = undefined
        if (runtime.dispose === uninstall) runtime.dispose = null
        runtime.bypass = false
      }
      runtime.dispose = uninstall
      return uninstall
    }

    return {
      inject: [],
      apply(ctx) {
        const config = readConfig()
        if (config.enabled !== true) return
        ctx.effect(() => install(config), 'pause-prank: stop-button interception')
      },
      // 仅给测试用:纯函数不该为了可测性向浏览器环境伸手。
      __test: {
        isStopLabel,
        isSendLabel,
        isStopButton,
        stopButtonOf,
      },
    }
  },
})
