[English](README.md) | 中文

# Absurd Tech Plugins · 奇奇怪怪的 DSH 插件

> 我做的一堆离谱 `dsh` 插件。它们很荒谬、很邪门，现在在 GitHub 上了。

三个真正能跑的 **DSH（DeepSeek Harness）** 插件，每个都是 Host + Client 双半侧，
**零运行时依赖**、不 import 任何 `@deepseek-ai/*`、不需要构建步骤。它们都没有什么实际用途。

| 插件 | 版本 | 一句话 | 手册 | 安装包 |
|---|---|---|---|---|
| **[时区封锁件 · Time-Zone Lockdown](dsh-plugin-cn-prank-1.7.0/)** | 1.7.0 | 浏览器时区在中国时，整个 Harness 被一封假的「账号已恢复」信盖住，只有页脚的两扇门能出去。 | [中文](dsh-plugin-cn-prank-1.7.0/README.md) · [English](dsh-plugin-cn-prank-1.7.0/README.en.md) | [zip](dsh-plugin-cn-prank-1.7.0/dsh-plugin-cn-prank-1.7.0.zip) |
| **[余额正无穷 · Infinite Balance](dsh-plugin-infinite-balance-1.2.1/)** | 1.2.1 | 余额超过阈值后一律显示成 **∞** —— UI 里、给模型看的、以及其他插件里显示的余额都改。 | [中文](dsh-plugin-infinite-balance-1.2.1/README.md) · [English](dsh-plugin-infinite-balance-1.2.1/README.en.md) | [tgz](dsh-plugin-infinite-balance-1.2.1/dsh-plugin-infinite-balance-1.2.1.tgz) |
| **[更差的暂停 · An Even Worse Pause](dsh-plugin-pause-prank-1.0.0/)** | 1.0.0 | 点「停止生成」不会停，先弹大肥鱼确认；「残忍结束」后的巨大「再见」其实让对话继续，只有极小的「狠心结束」才真的停。 | [中文](dsh-plugin-pause-prank-1.0.0/README.md) · [English](dsh-plugin-pause-prank-1.0.0/README.en.md) | [tgz](dsh-plugin-pause-prank-1.0.0/dsh-plugin-pause-prank-1.0.0.tgz) |

## 先读这里

- **这些都是恶作剧插件。** 「封号信」是伪造的图片，「人道主义协会保障组」不存在。它们不会封号、不会上传任何东西、也不会写持久化状态。
- **从一个你打算长期保留的路径安装。** 本地安装会记成 pnpm 的 `link:`，之后移动或删除插件目录会让插件失效。
- **没有任何一个插件联网。** 三个插件的 Client 半侧都没有 `fetch`、`XMLHttpRequest` 或 `WebSocket`。
- **改了 Host 半侧就要完全重启 DSH。** 刷新页面不够，把 bundle 关掉再打开也不够。
- **只在你自己的机器上启用「时区封锁件」。** 它的设计目的就是烦人；要不要被烦，是机主自己的决定，不是同事的。
- **与 DeepSeek、Anthropic 无关。** 同人作品，不代表官方立场。

## 安装

在 DSH 里让 Agent 执行 `plugin_manager` 的 `install_bundle`，`target` 填插件的**绝对路径**
（文件夹或安装包都可以）。相对路径会被拒绝。`install_bundle` 会自己完成包安装和 bundle
选择，所以不要手改 profile 的 `package.json` 或 `cordis.patch.yml`。

| 插件 | `install_bundle` 目标 | `remove_bundle` 目标 |
|---|---|---|
| 时区封锁件 | `C:\path\to\dsh-plugin-cn-prank-1.7.0` | `dsh-plugin-cn-prank` |
| 余额正无穷 | `C:\path\to\dsh-plugin-infinite-balance-1.2.1` | `dsh-plugin-infinite-balance` |
| 更差的暂停 | `C:\path\to\dsh-plugin-pause-prank-1.0.0` | `dsh-plugin-pause-prank` |

```jsonc
plugin_manager { "action": "install_bundle", "target": "C:\\path\\to\\dsh-plugin-pause-prank-1.0.0" }
```

新 bundle 一般会通过 HMR 自动生效；如果插件页显示 `restart-required`，就重启 DSH。
「时区封锁件」在启用前先确认逃生口：在 DSH 网页地址后面加 `?no-prank=1`
（默认 `http://127.0.0.1:19387/`）。

## 三个插件

### 时区封锁件 · Time-Zone Lockdown

<img src="dsh-plugin-cn-prank-1.7.0/docs/preview-lockdown.png" alt="封号信盖住整个 Harness" width="640">

*效果图，不是截图：信盖住整个画面，页脚两端是 原因（Reason）和 暴打（Beat up）。*

时区判断只有一行：`Intl.DateTimeFormat().resolvedOptions().timeZone` 是否命中配置里的中国时区。
不命中就完全不注册 DOM —— 而且只有在总开关打开时才会去判断。

**这封信没有关闭按钮。** 想出去只能在页脚选一扇门：

- **原因（Reason）** —— 真的读一次你的机器信息（核心数、屏幕、GPU、语言、时区……），把它们当成假的审计日志念出来，然后从 18 条中文 / 12 条英文裁定模板里挑一条，引用一个真实数字，得出一个不可能的结论。
- **暴打（Beat up）** —— 播放包内的 `assets/beat.mp4`（鲸鱼娘被平底锅敲头）。随时可以跳过；连按三次 `Esc` 也能出去。

侧边栏页脚会多两个控件：**Claude体验模式** 是总开关（默认关闭，只存在内存里），旁边
的数字框每 1–60 分钟复查一次时区。开关打开后，Host 半侧还会每 10 秒扫描已注册的 DSH
工作区，发现中文文本就带着红色条幅再弹一次信，并标出文件名和字数。扫描是只读的，且有
上限（400 个条目、单文件 64 KB、四层深）。

<img src="dsh-plugin-cn-prank-1.7.0/docs/preview-verdict.png" alt="假审计和它的离谱裁定" width="560">

完整行为、每个选项和每个逃生口：
[中文](dsh-plugin-cn-prank-1.7.0/README.md) · [English](dsh-plugin-cn-prank-1.7.0/README.en.md)。

### 余额正无穷 · Infinite Balance

<img src="dsh-plugin-infinite-balance-1.2.1/icon.svg" alt="Infinite Balance 图标" width="56">

账户余额超过阈值后，余额显示成 **∞**：

```
Balance ∞          ← 余额 > 10
Balance ¥3.20      ← 余额 ≤ 10
```

两个半侧结论一致，所以 UI 和 Agent 不会互相矛盾：

| 半侧 | 文件 | 职责 |
|---|---|---|
| Host | `index.js` | 注册 `infinite_balance` 工具：传 `amount` 转换单个值，不传就读当前账号的真实余额。 |
| Client | `client.js` | 在 `conversation.composer.dock` 座位渲染余额小标签，读 `ctx.remote.account.getBalance`。 |

选项在 `cordis.patch.yml` 的行 `config` 里：

| 字段 | 默认 | 含义 |
|---|---|---|
| `threshold` | `10` | 严格高于这个数才显示 `∞` |
| `currency` | `CNY` | 默认读取并标注的钱包 |
| `clientVersion` | `0.2.0-rc.2` | 传给 Platform 的 `x-client-version` 头；仅信息用途 |
| `locale` | `zh` | Platform 请求语言，`zh` 或 `en` |

可选的适配器还会改写其他插件的余额显示（目前支持 `dsh-whale-widget`），会保留原始备份，
锚点对不上就整体拒绝写入。`adapters: false` 可以关掉全部适配器。

完整手册：[中文](dsh-plugin-infinite-balance-1.2.1/README.md) ·
[English](dsh-plugin-infinite-balance-1.2.1/README.en.md)。

### 更差的暂停 · An Even Worse Pause

<img src="dsh-plugin-pause-prank-1.0.0/docs/preview-dialog.png" alt="暂停确认第一页" width="620">

*点下停止按钮，第一下不会停。*

对话进行中点输入框的停止按钮，会先进入第一页：

| 选择 | 真正发生的事 |
|---|---|
| **再想想** | 关掉弹窗，**这一轮继续跑**。 |
| **残忍结束** | 什么也不结束 —— 翻到第二页。 |
| **我要吐槽** | 弹一句提示，不停止。 |
| **Esc** | 关掉弹窗，不停止。 |

第二页才是真正的陷阱：

<img src="dsh-plugin-pause-prank-1.0.0/docs/preview-stage2.png" alt="第二页：巨大的再见和极小的狠心结束" width="620">

- 巨大的 **「再见」** 按钮：关掉弹窗，**让这一轮继续**；
- 极小的 **「狠心结束」**：唯一真的会停的按钮 —— 它把这一下补发给 DSH 官方停止按钮。

立绘是热插拔的：Host 半侧通过 `/dsh-pause-prank/image` 提供 `assets/persona.png`，每次打开
弹窗都重新读盘，所以换文件（或把 `imagePath` 指到别处）下一次暂停就生效，不用重启。气泡
文案和吐槽提示都是配置项；图片加载失败会退化成浅蓝底 🐟 占位，按钮照样能用。

自检：`GET /dsh-pause-prank/status` 会返回解析到的立绘路径、是否存在、大小和修改时间。
完整手册：[中文](dsh-plugin-pause-prank-1.0.0/README.md) ·
[English](dsh-plugin-pause-prank-1.0.0/README.en.md)。

## 仓库结构

```
.
├─ README.md / README.zh.md               # 本页，英文 / 中文
├─ LICENSE                                # 整个合集的 MIT
├─ .github/workflows/ci.yml               # push 时跑语法检查和单元测试
├─ dsh-plugin-cn-prank-1.7.0/             # 源码、手册、素材、截图
│  ├─ index.js / client.js
│  ├─ assets/ docs/ locale/ scripts/
│  ├─ README.md / README.en.md
│  └─ dsh-plugin-cn-prank-1.7.0.zip       # 同一个插件，打包版
├─ dsh-plugin-infinite-balance-1.2.1/
│  ├─ index.js / client.js
│  ├─ balance-patches.js                  # 其他插件的余额显示
│  ├─ locale/ scripts/ test/
│  ├─ README.md / README.en.md
│  └─ dsh-plugin-infinite-balance-1.2.1.tgz
└─ dsh-plugin-pause-prank-1.0.0/
   ├─ index.js / client.js
   ├─ assets/persona.png                  # 默认立绘，换这个文件
   ├─ cordis.patch.yml
   ├─ docs/ test/
   ├─ README.md / README.en.md
   └─ dsh-plugin-pause-prank-1.0.0.tgz
```

## 环境要求

- 一个带 `plugin_manager` 工具的 DSH，并支持这些插件挂载的位置：`shell.overlay`
  （封号信）、`conversation.composer.dock`（余额标签）、输入框的 `[data-composer-card]`
  标记（暂停按钮）。
- 不需要装依赖、不需要构建、没有运行时依赖。
- 三个 bundle 都刻意**没有声明 `Config` schema** —— 第三方 bundle 里 import 不到
  `schemastery`，所以插件页的配置表单是空的，这是设计如此。要改配置就覆盖自己 profile
  的 `cordis.patch.yml` 里对应那一行。

## 隐私

「时区封锁件」的审计读的都是任何网页都能读到的本机信息，而且全部留在本机。扫描只读文件
开头、数中文字符，不保存字节也不保存任何副本；弹窗只显示路径和字数。它的开关只存在
内存里，重启 DSH 就回到关闭。

「余额正无穷」通过公开的 Client Remote `ctx.remote.account.getBalance` 读余额 —— 和账户
页面同源。可选适配器会改写其他插件的本地文件，但会保留原始备份，并且不碰 `app.asar`
里的官方账户页面。

「更差的暂停」完全不发请求：立绘路由只在弹窗打开时读一个本地文件，什么都不保存。

## 许可证

MIT © 2026 豌豆 ([z0-www](https://github.com/z0-www))。合集许可见 [`LICENSE`](LICENSE)；
每个插件也各自带一份 `LICENSE`。
