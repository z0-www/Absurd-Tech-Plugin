# 时区封锁令 · Time-Zone Lockdown

[English](README.en.md) | 中文

> 一个**没有实际用途**的 DSH 整活插件:浏览器时区落在中国时,整个 DSH 会被一封假的「账号已恢复」通知盖住,直到你点掉左下角的「原因」或右下角的「暴打」。

一个 Host + Client 双半侧的 DSH 插件包(bundle)。零运行时依赖,不 import 任何 `@deepseek-ai/*` 包,不需要构建步骤。

![封锁层](docs/preview-lockdown.png)

*示意图(不是截图):通知盖住整个框架,「原因」和「暴打」住在图片**下方**那条同色页脚的左右两端。*

![裁定书](docs/preview-verdict.png)

*示意图:点「原因」后,假审计把真数据念出来,再给一句明显不成立的指控。*

```
浏览器时区 ∈ Asia/Shanghai, Asia/Urumqi, PRC, ...
        ↓
┌─────────────────────────────────────┐
│        [ deepseek 标志 ]            │
│                                     │
│   你好,                             │
│   本周早些时候,您的账户因违反……     │
│                                     │
│  [原因]                      [暴打] │   ← 图片下方页脚的两端
└─────────────────────────────────────┘
        ↓ 点「原因」                    ↓ 点「暴打」
   假审计 → 离谱裁定书 → 放行     放你自己的那段视频
```

> **这是恶作剧插件,不是真的停用通知。** 图片是伪造的通知截图,「人道协会的保障团队」是虚构的,插件不会停用账户、不会上传任何数据、不会写任何持久状态。两个按钮都能放行,另有五条逃生通道见下文。**请不要装在别人的机器上。**

## 目录

- [效果](#effect)
- [安装](#install)
- [两个按钮](#buttons)
- [换成你自己的视频](#beat-video)
- [Claude体验模式](#ban-mode)
- [时区复查间隔](#zone-recheck)
- [配置](#config)
- [紧急关闭](#escape)
- [它到底读了什么](#privacy)
- [换一张图](#artwork)
- [目录结构](#layout)
- [兼容性与失败姿态](#compat)
- [发布步骤](#publish)
- [License](#license)

<a id="effect"></a>
## 效果

| 半侧 | 文件 | 做什么 |
|---|---|---|
| Host | `index.js` | 占住 Loader 行(没有行就没有 `dsh.client`),并把行的 `config` 用 `webserver/index-inject` 的结构化 `global` 行发给浏览器。 |
| Client | `client.js` | 读时区 → 判定 → 在 `shell.overlay` 座位渲染全屏通知;键盘封锁;假审计;裁定书。 |

判定只用一条:`Intl.DateTimeFormat().resolvedOptions().timeZone` 是否命中配置的时区列表。命中就弹,不命中就完全不注册任何 DOM。

<a id="install"></a>
## 安装

`target` 由 DSH 的 `parseInstallSpec` 解析,只接受**绝对**本地路径、git 地址、tarball 或 npm 包名(相对路径会被拒绝)。

### 交给 Agent 装(推荐)

对 DSH 里的 Agent 说一句「安装这个插件」并附上地址,它会执行:

```jsonc
plugin_manager { "action": "install_bundle", "target": "github:Z0-www/dsh-plugin-cn-prank" }
```

| `target` 形式 | 例子 |
|---|---|
| GitHub 简写 | `github:Z0-www/dsh-plugin-cn-prank` |
| git 地址 | `git+https://github.com/Z0-www/dsh-plugin-cn-prank.git` |
| npm 包名(可带版本) | `dsh-plugin-cn-prank@1.0.0` |
| 本地目录(必须绝对路径) | `C:\Users\me\dsh-plugin-cn-prank` |
| tarball | `https://example.com/dsh-plugin-cn-prank-1.0.0.tgz` |

安装后不用手改 profile 的 `package.json` 或 `cordis.patch.yml`:`install_bundle` 自己做包安装与 bundle 选择。新 bundle 通常经 HMR 直接生效;若插件页显示 `restart-required`,重启 DSH。

> **装完刷新页面就会弹。** 想先确认逃生通道可用,再刷新:
> `http://127.0.0.1:19387/?no-prank=1`

### 卸载

```jsonc
plugin_manager { "action": "remove_bundle", "target": "dsh-plugin-cn-prank" }
```

<a id="buttons"></a>
## 两个按钮

两个出口都住在通知图片**下面**那条同色页脚里,左一个右一个 —— 通知本身没有关闭按钮,想出去只能从这两个里选一个。

> 为什么不压在图片角上:通知图最后一行「参考编号:TS-…」距离底边只有 26px(画到宽 560px 时约 14px),任何按钮都会盖住它。页脚底色取样自图片自身的 `#1f2125`,所以看起来像信纸多出来的一截,而不是贴上去的按钮条。换 `notice.webp` 时这个颜色要一起改(`client.js` 的 `NOTICE_BG`)。

### 左下「原因」

点下去做三件事:

1. **真的读一遍本机**。逻辑核心数、屏幕与视口尺寸、像素比、WebGL 报告的显卡型号、语言偏好、时区与 UTC 偏移、触控点数、JS 堆上限、电池电量与充电状态、`userAgentData` 的高熵字段(CPU 架构、位数、系统版本)。全部本地同步可得,**不发一个请求**。
2. **把这些真数据当证据念出来**。扫描日志逐行出现,进度条走到 100%。
3. **给出裁定书**。14 条模板(中英各 14 条)随机抽一条 —— 每条都是一句**对外口径**加一句**内心 OS**:

   > **违规裁定书** · TS-9f3a21c4-07bb-4e51-8d20f3aa · 手机号 / 支付型
   > **对外** 无法验证账号归属。
   > **内心OS** +86?这不是中餐外卖热线吗?我饿了,先封。

   想像一下:大肥鱼被迫穿上 Claude 的西装去当风控客服,她大概会一边甩尾巴一边发这些封号通知。她封完可能还会问一句「刚才封了谁?中午吃啥?」。

   点「我认了,立即整改」放行。默认不自动关闭(`reasonAutoCloseMs: 0`),免得笑话还没读完就没了。

   > ### ⚠️ 免责声明
   >
   > **纯属社区二创整活,不代表 DeepSeek、Anthropic 或任何官方立场。**
   >
   > 这 14 条模板讽刺的是**客服话术**本身 —— 官腔与真实动机之间的落差 —— 不是任何一家公司的真实政策,也不针对任何地区的用户。里面的 Claude、+86、VPN 都只是梗的零件。

   大肥鱼版封号的核心不是政治,是**吃、睡、摸鱼、怕麻烦、外包、晕船、记不住**。

### 右下「暴打」

点下去,播放 `assets/beat.mp4` —— 鲸鱼娘被平底锅敲头,然后趴在地上冒星星。

![敲打大肥鱼](docs/preview-beat.png)

*真实浏览器渲染:视频放在一块浅色画框里(视频自带浅底,不配一块同色画框的话,它会在深色舞台上变成一块刺眼的白色方块)。*

- **有声音。** `assets/beat.mp4` 自带一条 AAC 音轨 —— 之前没声音只是因为插件把它 `muted` 掉了(浏览器不允许带声自动播放,而静音是最省事的写法)。现在改成**先带声试**:点「暴打」本身就是一次用户手势,通常被允许;万一被拒,就退回静音播放,并在舞台底部说明原因,画面不会因为声音被拦而停住。见[声音](#beat-sound)。

- **唯一的动画。** 仓库自带一段 10 秒的示例 mp4,随包发布;丢你自己的进去就换掉了,见[下一节](#beat-video)。**1.7.0 起矢量兜底动画已删除**:没有可用视频时(文件被删、`beatVideo: false`,或者路由没注册),点「暴打」直接放行,不会再演第二段动画。

- **计数与进度条。** 顶栏右侧「已敲打 N/9 次」和底部那条进度条由 `beatHits` 与 `beatMs` 驱动,每击间隔 = `beatMs / beatHits`(至少 90 毫秒)。视频是**循环**播放的,所以 `beatMs` 同时决定你在这段里看到多长的片段 —— 默认 3200 毫秒,大约是那段 10 秒片子的前三分之一。

- **随时可以跳过**:播放期间点画面任意处立刻放行,连按三次 Esc 也行。
- 放行之后 DSH 恢复原样,不用刷新。

不想要这一段,就把 `beatMs` 设成 `0` —— 「暴打」退回成「点一下立刻放行」。

<a id="beat-video"></a>
## 换成你自己的视频

把 mp4 丢到 `assets/beat.mp4` 就完事了 —— 不用改代码,不用重新构建。

```powershell
# 覆盖掉仓库里那段示例,刷新页面,点「暴打」
copy 我的视频.mp4 assets\beat.mp4
```

**为什么不是内联进 `client.js`。** 通知图片是内联的,视频不是,因为两者代价相反:Client bundle 声明了 `immediately: true`(封锁层必须抢在输入框之前出现),于是一个 2 MB 的视频 base64 进去就是**每次刷新页面都下载 2.5 MB**,而大多数访问根本不会点「暴打」。所以视频走 Host 半侧的一条路由,只在真的点下去那一刻才开始拉取。

| 事实 | 值 |
|---|---|
| 路由 | `/dsh-cn-prank/beat.mp4`,由 `index.js` 注册 |
| Range 支持 | 有(`Accept-Ranges: bytes`,`206 Partial Content`)—— 没有它浏览器会先整包下载再跳转,第一帧会僵住 |
| 缓存 | `no-store`,所以**换文件只要刷新页面**,不用重启 DSH |
| CORS | `Access-Control-Allow-Origin: *`,因为页面可能是 `dsh-app://` 而不是同源 |
| 仓库自带的那段 | 720×720 / 10.08 秒 / H.264 + AAC / 约 1.9 MB |
| 建议规格 | mp4 / H.264,方形或接近方形,≤10 秒,几 MB 以内 |
| 关掉视频 | `beatVideo: false`,或删掉文件 —— 两种情况下「暴打」都变成「点一下立刻放行」 |

> ⚠️ **只放你有权使用的视频。** 仓库里那段示例带着「豆包AI生成」标识,这是**刻意保留**的:那是《人工智能生成合成内容标识办法》要求 AI 服务方添加、并明确禁止任何组织和个人删除、篡改、伪造、隐匿的显式标识。你换上去的素材同理 —— 如果它带标识,**请一起留着**。

**改完代码要重启。** `assets/beat.mp4` 是每次请求现读的,换文件只需刷新页面;但改动 `index.js` 这类 Host 代码后,DSH 只有在**重启**后才会重新加载这个模块 —— 切换插件的启用开关是不够的(实测:关掉再打开,`apply()` 不会被再次执行)。

<a id="ban-mode"></a>
## Claude体验模式

时区那套是「路过就打」;Claude体验模式是**你自己按下开关**,然后它开始盯你的文件。

> **名字只换了皮,配置项没动。** 这个功能原名叫「封号模式」,1.6.1 起界面上叫 **Claude体验模式**。但 `banMode`、`banModeRoots`、`banModeIntervalMs`、`banModeSuppressMs`、`banModeMaxFiles/Bytes/Depth` 这些配置键**保持原名** —— 它们是公开的覆盖接口,改名会让所有已经写好的 profile 覆盖静默失效。路由 `/dsh-cn-prank/status` 同理。

侧边栏页脚那颗按钮是**整个插件的总开关,默认「关」**。

> **关着就什么都不弹** —— 连时区那封也不弹。按一下才启动:时区那封和Claude体验模式的扫描一起进入待命;再按一下全部静音。
>
> 代价写在明处:**插件不再「自动整人」**。装上不按,它永远不会出现。「装上就自动弹」和「关着就什么都不弹」在逻辑上不能同时成立,这一版选了后者。

那颗状态灯就是全部状态:

![侧边栏页脚的开关](docs/preview-ban-toggle.png)

| 灯 | 意思 |
|---|---|
| 灰 | 关着 |
| 绿 | 开着,正在扫 |
| 琥珀 | 开着,静默中(那 30 分钟) |
| 红 | 开着,而且已经逮到一个中文文件 |

> 同一张图上那个数字框的灯是**另一套**:灰 = 没设复查间隔,琥珀 = 每 N 分钟复查一次。两颗灯各说各自的控件。

打开它之后,宿主半侧按 `banModeIntervalMs`(默认 10 秒)扫一遍你**已登记的工作区**。一旦在哪个文件里发现中文,全屏通知立刻压上来 —— 顶上多一条窄带,写明是哪个文件、多少个字:

![Claude体验模式命中](docs/preview-ban.png)

- **点「暴打」买 30 分钟安静**(`banModeSuppressMs`)。这 30 分钟里扫描照跑,但命中的结果会被丢掉 —— 所以时间一到它会自己回来,而不是需要你再点一次开关。
- **走「原因」那条路同样会静默。** 区别只在于你要不要读那份裁定书。
- **看哪些文件**:默认是你已在 DSH 里登记的工作区目录,**不是整个家目录**。想让它看你自己的目录就设 `banModeRoots: ['D:\某个目录']`。
- **边界**:一轮最多 400 个文件、单个文件最多读 64 KB、往下最多 4 层;`node_modules`、`.git`、`.pnpm`、`dist`、`build` 之类直接跳过;非文本扩展名连打开都不打开;符号链接一律不跟随。
- **只读,不出机器**:扫的是文件开头的字节,数的是中文字符个数,不保存内容、不上传、不写任何文件。通知里出现的也只有**文件路径和字数**,没有文件内容。
- **只想要时区那封**:`banMode: false` 只关掉**扫描能力**。那颗按钮和状态路由都还在(按钮是整个插件的总开关),状态文档里的 `scans` 会变成 `false`,客户端据此把那颗灯画成「扫不了」而不是「正在扫」—— 但它从此不读盘,命中也永远不会发生。

<a id="zone-recheck"></a>
## 时区复查间隔

侧边栏页脚还有第二个控件:一个能**直接打字**的数字框,外面套着「每 ___ 分钟」,范围 0–60,0 = 关。

> ### 这不是倒计时
>
> 它问的是「**多久确认一次现在还是不是中国时区**」,不是「过多久弹一次」。这两句话听起来像,行为完全不同:
>
> - 拖到 1 分钟,**不是**「1 分钟后弹」,而是**立刻先查一次**(是中国时区就当场弹),之后每 1 分钟再查一次,还是中国时区就**再弹一次**。
> - 它是**唯一不由扫描结果触发**的封号弹窗:不需要任何中文文件,一个人待在空目录里也会被弹。
> - 它反过来**只认时区**:浏览器时区不在 `timezones` 列表里,它永远不弹 —— 走的和时区封锁令是同一个判定。
>
> 为什么不做成倒计时:那条路上「到点了」和「时区仍然命中」是两件事,而通知里写的罪名(「使用代理 / VPN 违反服务条款」那一类)只有后者才立得住。这一版选了后者。

| 行为 | 结果 |
|---|---|
| 在框里打字(0–60) | 停手 600 毫秒后才提交一次;打「12」会先经过一个「1」,不防抖就是两个请求。回车等于「我说完了」,立刻落盘 |
| 填 0 或清空 | 取消复查。**总开关仍然开着** |
| 填 ≥1 | **顺手打开总开关** —— 填完却什么都不发生、而原因藏在另一个按钮里,那是最糟的设计 |
| 关掉总开关 | 复查间隔一起被清掉 —— 「关 = 零弹窗」这条规则不能被一个已经排好的间隔绕过去 |
| 刷新页面 | 间隔还在:它存在宿主内存里,覆盖层从状态接口把它读回来重新布防 |
| 重启 DSH | 回到「关」。状态只在内存里,和Claude体验模式那 30 分钟静默一样 |

空框里写着灰色的「关」,和填 0 是同一件事 —— 那本来就是同一件事。

这条路弹出来的信**顶上没有那条窄带**。窄带存在的唯一理由是报出「哪个文件、多少个字」,而这条路上没有文件可报 —— 顶上那句玩笑话(「中国鱼能飞」)在 1.6.1 里删掉了。**代价**:这封信现在和时区那封长得完全一样,画面上分不出是谁叫来的。

设好之后那颗灯是**琥珀色**,标题写着「每 N 分钟确认一次系统时区」;灰灯 = 没设。

<a id="beat-sound"></a>
### 声音

「暴打」有两个可能的声源,它们是分开开关的:

| 声源 | 什么时候响 | 默认 |
|---|---|---|
| 视频自带的音轨 | 视频在放 | **开**(`beatVolume: 0.9`) |
| 合成打击音效 | 在视频之上叠一层 | **关**(`beatSfxOverVideo: false`) |

**为什么不给视频默认叠音效**:它自己已经有一条音轨了,再叠一层钝响只会糊在一起。所以想要额外音效得显式打开 `beatSfxOverVideo`——如果你的视频是**静音**的,这就是你要的那个开关(顺手把 `beatHits` 调小,不然 3 秒里会响九下)。

> **1.7.0 起这是合成器唯一的用途。** `beatSfx`(矢量兜底动画的打击声,默认开)已随矢量动画一起删除 —— 没有矢量的地方,就没有「没有声源」这个问题。

合成音效**不带任何音频文件**:一记「平底锅砸在毛绒玩具上」= 一小段带通白噪声(「啪」)+ 一个快速下滑的低频正弦(「咚」),各走一条包络。仓库因此不用多出几百 KB 的采样,也不用赌浏览器支持哪种音频格式。

`AudioContext` 必须在用户手势里创建,否则浏览器会把它挂成 `suspended`、把第一声吞掉 —— 所以建图发生在**点「暴打」的那一刻**,不是页面加载时。

> 它是**默认关着**的,而且状态只存在内存里 —— 重启 DSH 就回到「关」。一个恶作剧开关最好是这种脾气。

<a id="config"></a>
## 配置

全部可调项就是 `cordis.patch.yml` 里那一行 `config`:

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关;`false` = 这个插件什么都不做 |
| `timezones` | 中国 9 个 IANA 时区 | 命中即封锁;`Asia/Shanghai`、`Asia/Chongqing`、`Asia/Harbin`、`Asia/Urumqi`、`Asia/Kashgar`、`PRC`、`Asia/Macau`、`Asia/Hong_Kong`、`Asia/Taipei` |
| `delayMs` | `900` | 页面加载后多久弹出,给界面留出渲染时间 |
| `oncePerSession` | `true` | `true` = 每个浏览器会话只弹一次(sessionStorage);`false` = 每次刷新都弹 |
| `blockKeyboard` | `true` | 封锁期间吞掉所有键盘事件(`Ctrl+K`、`Esc` 一律无效);鼠标不受影响 |
| `scanMs` | `4200` | 假审计的总时长上限 |
| `reasonAutoCloseMs` | `0` | 裁定书显示后自动放行的等待;`0` = 必须自己点按钮 |
| `beatMs` | `3200` | 「暴打」这一段的总时长,同时也是视频的播放上限(视频循环);`0` = 点一下立刻放行 |
| `beatHits` | `9` | 进度条和「已敲打 N 次」按几下记账(1-999)。**每击至少 90 毫秒**,所以击数拉大时实际时长会超过 `beatMs` |
| `beatVideo` | `true` | `true` = 播放随包发布的 `assets/beat.mp4`;`false` = 不放视频,点「暴打」立刻放行 |
| `beatVolume` | `0.9` | 视频自带音轨的音量(0–1) |
| `beatMuted` | `false` | `true` = 永远静音播放 |
| `beatSfxOverVideo` | `false` | 在视频之上叠一层合成打击音效(你的视频是静音时才需要) |
| `beatSfxVolume` | `0.5` | 合成音效的音量(0–1) |
| `banMode` | `true` | Claude体验模式的**扫描能力**是否可用。`false` = 总开关只管时区那封,永不读盘(按钮与路由仍在,状态灯会变成暗灰的「扫不了」) |
| `banModeRoots` | `[]` | 扫哪些目录;留空 = DSH 里已登记的工作区。拿不到工作区注册表时**一个都不扫**,不会退化成扫宿主进程的当前目录 |
| `banModeIntervalMs` | `10000` | 多久扫一遍;小于 1000 的值会被抬到 1000 |
| `banModeSuppressMs` | `1800000` | 点「暴打」买到多少毫秒安静(默认 30 分钟) |
| `banModeMaxFiles` | `400` | 一轮最多看多少个**条目(文件和目录一起算)**;`0` = 永远扫不到东西 |
| `banModeMaxBytes` | `65536` | 单个文件最多读多少字节 —— 更大的文件读**开头这么多**,不是整个跳过 |
| `banModeMaxDepth` | `4` | 往下最多钻几层 |

用户自己的 `cordis.patch.yml` 在 bundle 层**之后**应用,所以覆盖不会被 DSH 升级冲掉:

```yaml
- id: cn-prank
  name: dsh-plugin-cn-prank
  config:
    timezones:
      - Asia/Shanghai
    delayMs: 3000
    reasonAutoCloseMs: 8000
```

> **本插件刻意不声明 `Config` schema。** 声明它需要 import `schemastery`,而第三方 bundle 在 profile 里解析不到 `@deepseek-ai/*` 之外的包;一旦引入依赖,换 DSH 版本就可能加载失败。代价是插件页不会为该行渲染配置表单,请按上面的写法直接覆盖。
>
> Host 和 Client 各有一份默认值(`index.js` 的 `projectConfig`、`client.js` 的 `DEFAULT_CONFIG`)。正常路径下 Host 说了算,Client 那份只是「注入行还没进表」时的兜底,所以两边都改了才算真改。

<a id="escape"></a>
## 紧急关闭

四条通道,任意一条命中,**所有弹窗都不会出现**:

| 通道 | 用法 | 生效范围 |
|---|---|---|
| 配置 | `config.enabled: false` | 永久,推荐。这一条连侧边栏控件都不注册 |
| 全局变量 | 控制台 `window.__DSH_CN_PRANK_OFF__ = true` 后刷新 | 本次页面 |
| localStorage | 控制台 `localStorage.setItem('dsh-cn-prank:off','1')` | 永久(该浏览器) |
| query 参数 | `…/?no-prank=1` | 本次访问 |

> **后三条只拦弹窗,不拦侧边栏。** 逃生通道开着的时候,总开关和数字框照常显示、照常能点能填,状态灯照常变色,封号模式的扫描也照常跑 —— 只是永远不会弹。这是刻意的取舍(拆掉控件会让「为什么按钮不见了」比「为什么没弹」更难查),但它确实是一处会误导人的地方:一个看起来在工作、实际被静音的开关。想要连控件一起消失,用 `config.enabled: false`。

清除 localStorage 那条:

```js
localStorage.removeItem('dsh-cn-prank:off')
```

### 第五条:三次 Esc

封锁期间**连按三次 Esc** 也会放行 —— 数的是三次 `keydown`,长按的自动重复不算,第三次那一击也会被吞掉(不转交给应用)。`blockKeyboard: false` 时不需要它(那时键盘本来就没被吞)。

三次是刻意的:一次可能是误触,三次一定是有意的。恶作剧可以烦人,但不该真的把人关在里面 —— 尤其是当用户正用这个界面跟 Agent 说「按钮点不动」的时候。

<a id="privacy"></a>
## 它到底读了什么

恶作剧的分寸在这里。Client 半侧读的全部是**任何网页本来就能读到**的东西,全部在本地完成:

| 读了 | 来源 |
|---|---|
| 时区、UTC 偏移 | `Intl.DateTimeFormat().resolvedOptions()` |
| 逻辑核心数、设备内存档位 | `navigator.hardwareConcurrency`、`navigator.deviceMemory` |
| 屏幕、视口、像素比 | `screen`、`window.innerWidth/Height`、`devicePixelRatio` |
| 显卡型号 | `WEBGL_debug_renderer_info` 的 `UNMASKED_RENDERER_WEBGL` |
| CPU 架构、位数、系统版本 | `navigator.userAgentData.getHighEntropyValues()`(仅 Chromium 系) |
| 语言偏好 | `navigator.language`、`navigator.languages` |
| 触控点数 | `navigator.maxTouchPoints` |
| JS 堆上限 | `performance.memory.jsHeapSizeLimit` |
| 电池电量与充电状态 | `navigator.getBattery()`(仅 Chromium 系) |

读到的数据**只用于当场渲染那几行扫描日志和一句荒谬的指控,不落盘、不上传、不写 session 事件**。整个 `client.js` 里没有任何 `fetch`、`XMLHttpRequest` 或 `WebSocket`。

<a id="artwork"></a>
## 换一张图

通知图片是 `assets/notice.webp`,并以 data URI 内联在 `client.js` 里 —— 一个 Client 半侧只以一个文件的形式被送到浏览器,拿兄弟文件当资源就得赌 Host 半侧先注册好路由、还得赌页面 origin 一致;data URI 没有这两种失败方式。

代价是 `client.js` 里那一块是**生成**的。换图流程:

```powershell
# 1. 覆盖 assets/notice.webp(建议宽 1054px 左右,WebP 质量 82 大约 55 KB)
# 2. 重新内联
npm run notice

# 也支持直接从别的图生成
node scripts/build-notice.mjs --source 我的新图.png

# 3. CI 用这个检查两者是否一致
npm run verify
```

`scripts/build-notice.mjs` 只重写 `client.js` 里 `/* @notice-image:begin */` 与 `/* @notice-image:end */` 之间的那一行,其余部分一个字都不动。

<a id="layout"></a>
## 目录结构

```
.
├─ package.json              # dsh.bundle.patch + dsh.client 双声明,icon,exports,files
├─ cordis.patch.yml          # 插入 loader 行(id: cn-prank)+ 全部可调项
├─ index.js                  # Host 半侧:loader 行 + 注入 config + 下发 beat.mp4
├─ client.js                 # Client 半侧:判定、封锁层、假审计、裁定书、敲打(含内联图片)
├─ assets/
│  ├─ notice.webp            # 通知图片的正本(55 KB)
│  └─ beat.mp4               # 「暴打」放的视频(仓库自带一段 1.9 MB 示例;换成你自己的即可)
├─ docs/
│  ├─ preview-lockdown.png   # README 用的封锁层示意图
│  ├─ preview-verdict.png    # README 用的裁定书示意图
│  ├─ preview-beat.png       # README 用的「暴打」示意图(唯一那版:视频)
│  ├─ preview-ban.png        # README 用的Claude体验模式命中示意图
│  └─ preview-ban-toggle.png # README 用的侧边栏开关特写
├─ icon.svg                  # 插件卡片图标(≤256 KiB)
├─ locale/
│  ├─ zh.json                # { "meta": { "title", "description" } }
│  └─ en.json                # 英文兜底;en.json 必须存在,否则整组本地化不被读取
├─ scripts/
│  ├─ build-notice.mjs       # 把 assets/notice.webp 内联进 client.js
│  ├─ make-previews.mjs      # 用无头 Edge 重画 docs/ 下那些图
│  ├─ preview/harness.html   # 上面那个脚本要截的那个页面(随包发布,好让解包后也能重画预览图)
│  ├─ test-host-route.mjs    # 视频路由的单元测试(假 ctx + 假 req/res)
│  ├─ test-ban-mode.mjs      # Claude体验模式扫描的单元测试(临时目录做样本)
│  └─ verify-manifests.mjs   # 清单与打包自检(CI 与本地共用)
├─ .github/workflows/ci.yml
├─ README.md / README.en.md / CHANGELOG.md / LICENSE
└─ .gitignore
```

<a id="compat"></a>
## 兼容性与失败姿态

- **座位**:`shell.overlay` 是框架级浮动层,官方文档里明确写着「这一层本身 click-through,条目要自己收回指针事件」。所以封锁层的根节点显式带 `pointerEvents: 'auto'` —— 否则它既盖不住页面也点不动。
- **层级**:`z-index: 9000`,高于官方引导页的 `900`。
- **尺寸**:卡片宽度写成 `min(92vw, 560px, 73vh × 宽高比)`,任何窗口比例下通知都完整可见,按钮也不会飘到图外。
- **键盘**:`window` 的**捕获**阶段吞掉 `keydown/keyup/keypress` 并 `stopImmediatePropagation`,所以官方快捷键在封锁期间全部失效;鼠标不受影响,两个按钮照常可点。
- **TDZ**:`NOTICE_IMAGE` 声明在 `window.__ModuleLoader__.load(...)` **之前**。模块加载器允许同步调用 factory,声明写在后面会让 `const` 落在暂时性死区里,整个 Client 半侧直接炸掉。
- **配置通道**:走 `webserver/index-inject` 的结构化 `global` 行。桌面壳的 `index.html` 直出安装包 dist,`tapIndex` 在那边永远不生效,结构化行是两种形态下都生效的唯一通道。
- **可选服务**:语言走 `ctx.get('locale')`,拿不到就退回 `navigator.language`;Host 半侧对 `webServer` 用 `ctx.inject(['webServer'], …)` 声明依赖,而不是 `ctx.get` 试探 —— 缺服务时前者等,后者会安静地少注册一条路由,而「路由不见了」比「注入没满足」难查得多。
- **视频降级**:`assets/beat.mp4` 不存在时路由回 404,浏览器侧 `onError` 顺着 URL 列表往下走,全失败就**立刻放行**(不显示空舞台)。所以「没放视频」也是正常路径,不是错误路径 —— 1.7.0 起没有第二段兜底动画可退。
- **页脚而不是浮层**:两个出口是卡片的普通流式子节点,面板(审计、裁定书、敲打舞台)只在图片那个定位框里绝对定位 —— 所以面板永远盖不住出口。
- **Claude体验模式的边界**:扫描是只读的、由按钮显式打开的、有**条目数/字节数/层数**三重上限的(目录也算条目,所以一棵全是目录的树不会让一轮跑不完),默认只看 DSH 工作区;非文本扩展名不打开,符号链接不跟随。命中记的是路径和字数,不是内容。`banMode: false` 之后扫描能力关掉,但按钮与状态路由仍在(那颗按钮是整个插件的总开关)。
- **两条弹窗路径不打断正在进行的交互**:命中与复查间隔只在 `phase` 是 `idle`/`over` 时把通知拉起来。少了这道闸,宿主每 10 秒盖的一个新 `hit.at` 会把读到一半的裁定书整封顶掉、把敲打动画停在半途。
- **两份状态一份真相**:侧边栏的开关和全屏覆盖层共用同一个 store(引用计数轮询),否则「按钮显示静默中」和「覆盖层决定弹不弹」会各自读到不同时刻的快照,表现成「关掉的弹窗自己回来」。
- **「时区复查间隔」的时钟在客户端**:宿主只存那一个分钟数(所以刷新页面不会丢),`setInterval` 和时区判定都跑在浏览器里。开两个页面就有两份复查,各自弹各自的,而两边都不写任何状态。
- **失败姿态**:时区读不到、`getBattery` 不存在、WebGL 被禁用、`localStorage` 被禁 —— 一律退化成「少一行扫描日志」或「用默认配置」,不会让任何 slot 崩掉,更不会把人性命关天的事情拦在外面(它拦的只有 Ctrl+K)。
- **不残留**:所有注册都在 `ctx.effect` 里,返回其 disposer;卸载后 DOM 与事件监听一起消失。

<a id="publish"></a>
## 发布步骤

1. **包身份已就位**(`package.json`):`author` 署「豌豆」,`repository` / `homepage` / `bugs` 全部指向 `github.com/Z0-www/dsh-plugin-cn-prank`。日后换仓库位置,这四处要一起改。

2. **本地自检**(与 CI 同一套,无需安装依赖):

   ```powershell
   npm run check    # node --check 解析全部源码
   npm test         # 视频路由 + Claude体验模式扫描的单元测试
   npm run verify   # 校验清单、补丁行、exports、locale、内联图片
   ```

3. **推上 GitHub**:

   ```powershell
   git init -b main
   git add .
   git commit -m "feat: 时区封锁令 1.0.0"
   git remote add origin https://github.com/Z0-www/dsh-plugin-cn-prank.git
   git push -u origin main
   ```

4. **别人怎么装**(二选一,别混用 —— 两种来源同名会并存冲突):

   ```powershell
   dsh plugin --profile web add github:Z0-www/dsh-plugin-cn-prank
   dsh plugin --profile web add dsh-plugin-cn-prank   # 发过 npm 之后
   ```

5. **可选:发 npm。** 名字 `dsh-plugin-cn-prank` 若尚未被占用可以直接 `npm publish`;若日后被占,改成 `@<scope>/dsh-plugin-cn-prank`,**并同步改 `cordis.patch.yml` 里的 `name`**(loader 行按包名解析)。

<a id="license"></a>
## License

[MIT](LICENSE)
