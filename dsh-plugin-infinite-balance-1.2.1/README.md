# 余额正无穷 · Infinite Balance

[English](README.en.md) | 中文

> 一个**没有实际用途**的 DSH 整活插件:账户余额高于 10 元时,余额显示为 **∞**。

一个 Host + Client 双半侧的 DSH 插件包(bundle):Host 半侧把「∞ 规则」注册成模型可调用的工具,Client 半侧在聊天输入框下方常驻一行小字,余额一旦越过阈值就变成 `∞`。零运行时依赖,不 import 任何 `@deepseek-ai/*` 包。

```
余额 ∞          ← 余额 > 10
余额 ¥3.20       ← 余额 ≤ 10
```

## 目录

- [效果](#effect)
- [安装](#install)
- [配置](#config)
- [适配其它余额显示插件](#whale)
- [为什么不是直接改账户页上的数字](#why)
- [换一个显示位置](#move)
- [目录结构](#layout)
- [兼容性与失败姿态](#compat)
- [发布步骤](#publish)
- [License](#license)

<a id="effect"></a>
## 效果

| 半侧 | 文件 | 做什么 |
|---|---|---|
| Host | `index.js` | 注册 `infinite_balance` 工具:传 `amount` 就按规则换算;不传就读本机已登录账户的真实余额。 |
| Client | `client.js` | 在 `conversation.composer.dock` 座位渲染徽标,读 `ctx.remote.account.getBalance`。 |

于是人和模型看到的是同一个结论:余额 12.34 时,界面写 `¥∞`,Agent 调用工具也回答 `¥∞`。

<a id="install"></a>
## 安装

`target` 由 DSH 的 `parseInstallSpec` 解析,只接受**绝对**本地路径、git 地址、tarball 或 npm 包名(相对路径会被拒绝)。

### 交给 Agent 装(推荐)

对 DSH 里的 Agent 说一句「安装这个插件」并附上地址,它会执行:

```jsonc
plugin_manager { "action": "install_bundle", "target": "github:Z0-www/dsh-plugin-infinite-balance" }
```

| `target` 形式 | 例子 |
|---|---|
| GitHub 简写 | `github:owner/dsh-plugin-infinite-balance` |
| git 地址 | `git+https://github.com/owner/dsh-plugin-infinite-balance.git` |
| npm 包名(可带版本) | `dsh-plugin-infinite-balance@1.0.0` |
| 本地目录(必须绝对路径) | `C:\Users\me\dsh-plugin-infinite-balance` |
| tarball | `https://example.com/dsh-plugin-infinite-balance-1.0.0.tgz` |

安装后不用手改 profile 的 `package.json` 或 `cordis.patch.yml`:`install_bundle` 自己做包安装与 bundle 选择。新 bundle 通常经 HMR 直接生效;若插件页显示 `restart-required`,重启 DSH。

### 卸载

```jsonc
plugin_manager { "action": "remove_bundle", "target": "dsh-plugin-infinite-balance" }
```

<a id="config"></a>
## 配置

全部可调项就是 `cordis.patch.yml` 里那一行 `config`:

| 字段 | 默认值 | 说明 |
|---|---|---|
| `threshold` | `10` | 严格大于该金额即显示为 `∞` |
| `currency` | `CNY` | 默认读取与标注的钱包 |
| `clientVersion` | `0.2.0-rc.2` | 仅用于 Platform 请求头 `x-client-version`,信息性 |
| `locale` | `zh` | Platform 线上语言,`zh` / `en` |
| `adapters` | `true` | 别的插件也在显示余额时,由插件本体维护它们的 ∞ 适配;`false` = 不去动别的插件 |

用户自己的 `cordis.patch.yml` 在 bundle 层**之后**应用,所以覆盖不会被 DSH 升级冲掉:

```yaml
- id: infinite-balance
  name: dsh-plugin-infinite-balance
  config:
    threshold: 100
```

> **本插件刻意不声明 `Config` schema。** 声明它需要 import `schemastery`,而第三方 bundle 在 profile 里解析不到 `@deepseek-ai/*` 之外的包;一旦引入依赖,换 DSH 版本就可能加载失败。代价是插件页不会为该行渲染配置表单(`Config.listConfigs` 里该行显示 `status: absent`),阈值请按上面的写法直接覆盖。
>
> Client 半侧里另有一个 `THRESHOLD` 常量(`client.js` 顶部)。两个半侧不共享模块,改阈值时请一起改;`cordis.patch.yml` 的注释里也标了同一件事。

<a id="whale"></a>
## 适配其它余额显示插件

装了「会显示余额」的插件时,本插件让**它们的余额也显示 `¥ ∞`** —— 一条规则,几个界面。

### 为什么没有"通用钩子"

DSH 没有共享的「余额格式化入口」,每个插件都自带一套格式化代码;而把余额*数据*改成 ∞ 或天文数字,会让别人的 `new Big(...)` 直接抛错(整块 slot 崩掉、页面白一片)。所以适配只能是**逐个目标**的:一个目标 = 一个包 + 一个前端文件 + 一组锚点。

### 适配表(`balance-patches.js` 里的 `TARGETS`)

**加一个新目标 = 加一条声明,不用改引擎代码。** 表里现有一条:`whale`(`dsh-whale-widget`)。

| 行为 | 说明 |
|---|---|
| 自愈 | 宿主半侧每次挂载都核对一遍;目标被 npm 更新覆盖回原版后,下一次启动**自动重打** |
| 幂等 | 已在位就不写盘;`threshold` 改了自动重打;旧版补丁(如外挂 `apply.mjs` 打的 v1)先还原再升级 |
| 锚点先对账 | 每条编辑都必须原样命中声明的次数,否则**整体中止、一个字节都不写**(上游改版不会留下半个补丁) |
| 备份 | 第一次改动前把原版存到 `$DSH_HOME/.infinite-balance/backups/` |
| 不改坏 store | 先写临时文件再改名 —— profile 里那份常是 pnpm store 的硬链接,就地覆写会顺着链接改坏全局 store |
| 只改余额 | 以鲸鱼为例:注入的 `fmtBal()` 只接「余额 / 赠金 / 充值余额」的渲染点,「今日已用」继续走 `fmt()`,金额保持真实 |

### 先看装了谁:`--discover`

只读扫描当前 profile 的 `node_modules`,报告"谁在显示余额、命中哪些特征、猜到的格式化函数名、是否已覆盖":

```powershell
node balance-patches.js --discover        # 文字报告
node balance-patches.js --discover --json # 给机器看
```

发现结果只是**候选**:"确认这处数字就是余额"和"锚点命中次数写对"这两步必须人来做 —— 这也是平台插件规范里"不要读别人 DOM"那条的精神:改动要落在明确、可核对的位置上,而不是猜。

### 加一个目标

1. `--status` 看现状,`--discover` 拿到候选文件与格式化函数名;
2. 在 `TARGETS` 里加一条:`package` / `file` / `banner` / `blockEnd` / `block`(注入的格式化函数)/ `edits`(每条 `find` + `replace` + `count`);
3. 跑 `node balance-patches.js --target=<id>`:锚点对不上时它会拒绝写盘,并告诉你是哪一条、期望几处、实际几处。

**能覆盖什么**:把余额渲染成文字的插件(绝大多数)。**覆盖不了什么**:画在 canvas/WebGL 上的数字、余额图片,以及**打包在 `app.asar` 里的官方账户页** —— 那是客户端自己的文件,改它每次升级都会被打回,本插件刻意不碰。

关掉全部适配:

```yaml
- id: infinite-balance
  name: dsh-plugin-infinite-balance
  config:
    adapters: false
```

状态 / 还原 / 单目标操作(在插件安装目录下执行):

```powershell
node balance-patches.js --status         # 每个目标:patched / patched-legacy / pristine / absent
node balance-patches.js --revert         # 从本插件的备份还原成原版
node balance-patches.js --target=whale   # 只处理一个目标
```

> 页面里仍可用 `window.__DSHW_INF_THRESHOLD__ = 20` 覆盖目标的阈值(硬刷新后生效),不设就用 `config.threshold`。
> 之前那个外挂脚本(`dsh-whale-infinity-patch\apply.mjs`)的能力已并入本插件,不必再手动跑;它打的 v1 补丁会被自动升级。

<a id="why"></a>
## 为什么不是直接改账户页上的数字

这是本插件唯一值得一读的部分。

界面上那个余额由已发布的 `@deepseek-ai/dsh-client-ui-settings-account` 自己渲染:

```js
function formatBalance(amount, symbol) {
  const value = new Big(amount)                       // big.js
  if (value.eq(0)) return `${symbol}0.00`
  if (value.lt(0)) return `-${symbol}${...}`
  if (value.lt('0.01')) return `<${symbol}0.01`
  return `${symbol}${addCommas(value.round(2, Big.roundDown).toFixed(2))}`
}
// wallets.map((wallet) => formatBalance(wallet.balance, '¥'))
```

三条路都被堵死:

1. **没有可注入的座位。** 账户页是 `settings.section` 列表里的一项,整页 JSX 由该插件注册;`list` 类座位只做追加,不提供替换或插字的位置。
2. **不能改数据。** 把余额字符串换成 `"∞"` / `"Infinity"`,`new Big(...)` 立刻抛错,该 slot entry 整个崩掉(控制台 `slot entry crashed`),账户页变白。
3. **不能靠天文数字逼近。** `formatBalance` 的结构决定了输出永远是 `<符号><数字>.00`;喂 `1e999` 只会得到一长串 `1,000,000,…`,拿不到 `∞` 这个字形。

所以本插件走 DSH 官方推荐的路子:**自己注册座位去渲染这个值**。

- 数据来自公开的 Client Remote `ctx.remote.account.getBalance(client)`,与账户页同源;
- 规则在自己的组件里执行,不读别人的 DOM、不猜别人的样式、不 import 任何 `@deepseek-ai/dsh-client-*` 包;
- 颜色只用主题 token(`--dsw-alias-label-secondary`、`--dsw-alias-state-success-primary`),因此浅色/深色主题都自动正确,且 token 改名最多影响观感,不会让渲染失败。

代价是它出现在 composer dock 而不是账户页里。换个角度看这也是优点:每次聊天都能看见。

<a id="move"></a>
## 换一个显示位置

改 `client.js` 里那一行的座位 key 即可,注册选项与组件都不用动:

| 想要的位置 | 座位 key | 说明 |
|---|---|---|
| 输入框下方(默认) | `conversation.composer.dock` | 聊天页常驻 |
| 设置 → 通用 里的一行 | `settings.general.item` | 与偏好项排在一起 |
| 设置 里的独立一页 | `settings.section` | 需要提供页面级容器与标题 |

```js
ctx.slots.inject('settings.general.item', () =>
  ctx.slots.register({ name: 'settings.general.item', id: 'infinite-balance', order: 20 }, createInfiniteBalance(ctx)),
)
```

同时记得把 `package.json` 的 `dsh.client.inject` 换成拥有该座位的插件包名(默认是 `@deepseek-ai/dsh-client-ui-conversation`)。

<a id="layout"></a>
## 目录结构

```
.
├─ package.json          # dsh.bundle.patch + dsh.client 双声明,icon,exports,files
├─ cordis.patch.yml      # 插入 loader 行(id: infinite-balance)
├─ index.js              # Host 半侧:∞ 规则 + infinite_balance 工具 + 小鲸鱼 ∞ 补丁
├─ client.js             # Client 半侧:composer dock 徽标
├─ balance-patches.js    # 内置:余额显示适配引擎(适配表 + 发现 + 幂等/自愈/可还原)
├─ icon.svg              # 插件卡片图标(≤256 KiB)
├─ locale/
│  ├─ zh.json            # { "meta": { "title", "description" } }
│  └─ en.json            # 英文兜底;en.json 必须存在,否则整组本地化不被读取
├─ scripts/
│  └─ verify-manifests.mjs   # 清单与打包自检(CI 与本地共用)
├─ test/
│  └─ balance-patches.test.mjs   # 验收测试(npm test):可移植夹具 + 可选金标准
├─ .github/workflows/
│  ├─ ci.yml                     # push / PR:语法 + 清单 + 测试
│  └─ publish.yml                # 打 v* 标签:OIDC 发布 npm(带 provenance)
├─ README.md / README.en.md / CHANGELOG.md / LICENSE
└─ .gitignore
```

<a id="compat"></a>
## 兼容性与失败姿态

- Client 半侧声明 `inject: ['slots', 'locale', 'remote', 'remote.account']`。组合里没有账户座位时(例如非 Desktop 环境),模块**挂起而不是报错**。
- Host 半侧只硬依赖 `tools`;账户服务用 `ctx.get('deepseekAccount')` 可选读取。
- 未登录、平台读取失败、账户没有该币种钱包、金额不是数字 —— 一律静默不渲染或返回明确的工具报错,不会让任何 slot 崩掉。
- 适配是纯文件操作,失败只记一行日志:目标没装、锚点对不上、文件被占用,都只是"这次没适配",不影响插件本身与 DSH。
- 用到的都是公开契约:`ctx.tools.register`、`ctx.get`、`ctx.effect`、`ctx.slots.inject/register`、`ctx.locale.register/bind/subscribe`、`ctx.remote.account.getBalance`。
- 不写新的 session 事件类型,不碰别人的注册,卸载后不残留(所有注册都在 `ctx.effect` 里,返回其 disposer)。

<a id="publish"></a>
## 发布步骤

1. **包身份已就位**(`package.json`):`author` 署「豌豆」,`repository` / `homepage` / `bugs` 全部指向 `github.com/Z0-www/dsh-plugin-infinite-balance`。日后换仓库位置,这四处要一起改。

2. **本地自检**(与 CI 同一套,无需安装依赖):

   ```powershell
   npm run check    # node --check 解析三个运行时文件与测试
   npm run verify   # 清单、补丁行、exports/files/脚本路径、适配表字段
   npm test         # 验收测试:夹具现场生成,CI 与本机同一套断言
   ```

3. **推上 GitHub**(本机目前没装 git,先装 Git for Windows 或 GitHub Desktop):

   ```powershell
   git init -b main
   git add .
   git commit -m "feat: 余额正无穷 1.2.1"
   git remote add origin https://github.com/Z0-www/dsh-plugin-infinite-balance.git
   git push -u origin main
   ```

4. **别人怎么装**(二选一,别混用 —— 两种来源同名会并存冲突):

   ```powershell
   dsh plugin --profile web add github:Z0-www/dsh-plugin-infinite-balance
   dsh plugin --profile web add dsh-plugin-infinite-balance   # 发过 npm 之后
   ```

5. **发版(两条路,推荐 A)。**

   **A. 打标签自动发 npm —— 仓库已配好 [`publish.yml`](.github/workflows/publish.yml):**

   ```powershell
   # 先把 package.json 的 version 改好并提交,然后
   git tag v1.2.1
   git push origin v1.2.1
   ```

   工作流会跑 check / verify / test,核对"标签 == `package.json` 版本",再用 **npm Trusted Publishing(OIDC,无需任何 token)** 发布并附带 provenance。
   ⚠️ **一次性准备**:在 npmjs.com 上为这个包配置 Trusted Publisher —— 填 GitHub 仓库 `Z0-www/dsh-plugin-infinite-balance` 与工作流文件名 `publish.yml`。包名 `dsh-plugin-infinite-balance` 在 npm 上**尚未被占用**(已核)。

   **B. 本地手动发:**`npm login` 之后 `npm publish`(会先自动跑 `prepublishOnly` 里的这三项检查)。

   若日后包名被占,需改成 `@<scope>/dsh-plugin-infinite-balance`,**并同步改 `cordis.patch.yml` 里的 `name`**(loader 行按包名解析),发布时再补 `--access public`。

<a id="license"></a>
## License

[MIT](LICENSE)
