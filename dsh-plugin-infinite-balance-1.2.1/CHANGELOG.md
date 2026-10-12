# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-01-01

### Added

- Host 半侧:把「余额高于阈值即视为正无穷」注册成 `infinite_balance` 工具。传 `amount` 换算单个金额;不传则通过 `ctx.deepseekAccount.getBalance` 读取本机已登录账户的真实余额(同币种充值钱包与赠送钱包求和)。
- Client 半侧:在 `conversation.composer.dock` 座位常驻徽标,通过 `ctx.remote.account.getBalance` 读取余额,越过阈值显示 `∞`,否则显示真实金额。
- 配置项 `threshold` / `currency` / `clientVersion` / `locale`,全部来自 loader 行的 `config`。
- 中英双语插件卡片元数据(`locale/zh.json`、`locale/en.json`)与 `icon.svg`。
- 零运行时依赖;主题色只用 `--dsw-alias-*` token。

## [1.2.1] - 2026-10-10

### Added

- 仓库自带验收测试 `test/balance-patches.test.mjs`(`npm test`):夹具全部现场生成,CI 与本机跑同一套断言;本机装了真鲸鱼时额外跑一段金标准检查(反推原版、按版本核对字节数、往返一致),CI 上自动跳过。
- `.github/workflows/publish.yml`:打 `v*` 标签即经 npm Trusted Publishing(OIDC,无 token)发布并附 provenance,且拒绝"标签与 `package.json` 版本不一致"的发布。
- `scripts/verify-manifests.mjs` 增强:`exports` / `files` / `scripts` 指向的路径必须真实存在,`test/` 必须有 `.mjs` 用例,并校验 `TARGETS` 每条声明字段齐全(免得一处笔误静默停掉一个目标)。

### Fixed

- **横幅漏写阈值后无法自愈**:仅凭"横幅在不在"判断会把它当成"已在位",于是每次挂载都重打同一个文件。现在会识别为 `repaired`:还原后重打并写明阈值。
- **发现报告对同一文件重复出两条**:manifest 的 `entry` 与 `exports['./client']` 指向同一文件时会被各算一次。现在统一规范化后去重。
- **作用域包名(`@scope/name`)会使备份文件名带上路径分隔符**,写到不存在的子目录导致失败。现在把 `/` 转成 `+`。
- `test/` 此前不在仓库里、CI 也没有测试步骤 —— 回归网只存在于临时目录,现已入库并接入 CI。

## [1.2.0] - 2026-10-10

### Added

- 适配引擎 `balance-patches.js`(取代只认小鲸鱼的 `whale-infinity.js`):余额显示适配表 `TARGETS`,**加一个目标 = 加一条声明**,不用改引擎代码。
- `--discover`:只读扫描 profile 的 `node_modules`,报告"谁在显示余额、命中哪些特征、疑似格式化函数名、是否已覆盖",把适配一个新插件的人工压到"确认锚点"这一步。
- `--target=<id>` 只处理单个目标;`--status` / `--revert` 覆盖全部目标。

### Changed

- 锚点账本改成通用形式:每条编辑声明期望命中次数,任一不符即整体中止、不写盘;注入区块由 `blockEnd` 整体摘除,还原与升级共用同一条路。
- 配置项 `whale` → **`adapters`**:语义变成"是否去适配别的插件"。
- 发现扫描不把自己(`dsh-plugin-infinite-balance`)算进候选。

### Fixed

- 横幅漏写阈值:`{{banner}}` 替换时丢了 `threshold=`,会让引擎在每次挂载时误判"未在位",反复重打同一个文件。

## [1.1.0] - 2026-10-10

### Added

- 内置小鲸鱼 ∞ 补丁(`whale-infinity.js`):装了 `dsh-whale-widget` 时,它的余额也显示 `¥ ∞`。宿主半侧每次挂载确保补丁在位,小鲸鱼被 npm 更新覆盖回原版后,下一次启动自动重打。
- 新增配置项 `whale`(默认 `true`);置 `false` 即完全不去动别的插件。
- 命令行:`node whale-infinity.js --status` / `--revert`(还原需本插件自己的备份)。

### Changed

- 补丁写入改为"先写临时文件再改名",避免顺着 pnpm store 的硬链接改坏全局 store。
- 旧版外挂补丁(v1,阈值写死 10)在挂载时会先还原、再升级为 v2(阈值跟随 `threshold`,并在调用时读取页面覆盖)。
- `package.json`:`exports` 增加 `./whale-infinity`,`files` 增加 `whale-infinity.js`,`check` 一并解析新文件。

[1.2.1]: https://github.com/Z0-www/dsh-plugin-infinite-balance/releases/tag/v1.2.1
[1.2.0]: https://github.com/Z0-www/dsh-plugin-infinite-balance/releases/tag/v1.2.0
[1.1.0]: https://github.com/Z0-www/dsh-plugin-infinite-balance/releases/tag/v1.1.0
[1.0.0]: https://github.com/Z0-www/dsh-plugin-infinite-balance/releases/tag/v1.0.0
