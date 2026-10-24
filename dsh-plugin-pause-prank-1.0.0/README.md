# 更差的暂停 · An Even Worse Pause

[English](README.en.md) | 中文

> 一个 DSH 暂停整活插件。点「停止生成」不会停，而是弹出大肥鱼拟人确认；
> 「残忍结束」后的巨大「再见」其实让对话继续，只有极小的「狠心结束」才真的停。

**更差的暂停**（An Even Worse Pause）是 DSH 的恶作剧插件。**对话进行中点「暂停」（停止生成），不会立刻停**，而是弹出
一张「大肥鱼舍不得你走」的拟人暂停确认：

![弹窗预览](docs/preview-dialog.png)

- **再想想** —— 关掉弹窗，这一轮继续跑（整活的落点）。
- **残忍结束** —— 不会结束：翻到第二页确认。
- **我要吐槽** —— 弹一句吐槽已收到，不停止。
- **Esc** —— 关掉弹窗，不停止。

点「残忍结束」后是第二页——**看起来最像告别的按钮最不告别**：

![第二页预览](docs/preview-stage2.png)

- **巨大的「再见」** —— 关掉弹窗，**这一轮继续跑**；
- **极小的「狠心结束」** —— 真的停：把这一下补发给官方那颗停止按钮，由它来停。

弹窗里是大肥鱼（DeepSeek 娘）的立绘、一句「真的要说再见吗？」，以及一个提示：
**你犹豫的时候，词元还在消耗**。窄屏会自动收窄，按钮不会挤丢：

![窄屏预览](docs/preview-small.png)

立绘是**热插拔**的：每次打开弹窗都重新从磁盘读，换图不用重启 DSH、不用刷新页面。

---

## 换图（最常做的事）

默认立绘在 `assets/persona.png`。三种改法：

| 做法 | 怎么操作 |
|---|---|
| 直接覆盖 | 把新图保存成 `assets/persona.png`（或直接覆盖它） |
| 指到别处 | 在 `cordis.patch.yml` 里把 `imagePath` 改成绝对路径，如 `C:/Users/lin/Pictures/我的图.png` |
| 相对路径 | `imagePath: '../meme.png'` 按插件目录解析；`~/pics/a.png` 会展开到用户目录 |

改完之后**不用重启、不用刷新**——再点一次暂停，弹的就是新图。

> 立绘在弹窗上部以 27:20 的比例 `cover` 裁切（主体偏上）。换图时把人物脸放在画面
> 中上部最稳妥；图片加载失败会自动换成一条浅蓝底 + 🐟 的占位，按钮照样能按。

---

## 文案

`cordis.patch.yml` 里这几项都能改：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关。关掉只是不装拦截器，图片路由还在（方便先换图） |
| `imagePath` | `''` | 空 = 包内 `assets/persona.png`；支持绝对路径、相对路径、`~/` |
| `imageAlt` | `DeepSeek 娘` | 立绘的替代文字，也是弹窗的无障碍名称 |
| `kicker` | `🐟 大肥鱼食堂 · 暂停确认` | 标题上方那行小字 |
| `title` | `真的要说再见吗？` | 弹窗标题 |
| `subtitle` | `这一轮才刚开始，白饭还没吃完呢……` | 标题下面那句 |
| `cruelSubtitle` | `要把大肥鱼一个人留在这里吗？` | 点「残忍结束」翻到第二页时换成的文案 |
| `complainToast` | `已记录你的不满，并转交给了大肥鱼 🐟` | 点「我要吐槽」时的提示 |

改完配置后需要让 DSH 重新加载插件（profile 开着 HMR 时会自动重载；没开就重启）。

---

## 自检与排障

两个只读路由（只在 127.0.0.1 上，没有写操作）：

```
GET /dsh-pause-prank/image    # 弹窗用的立绘，每次现读磁盘
GET /dsh-pause-prank/status   # 解析到的绝对路径、文件在不在、多大、什么时候改过
```

换完图弹窗不对时，先看 `status`：路径是不是你以为的那个、`mtime` 有没有变、`size` 对不对。
`image` 返回 404 时，响应正文会直接告诉你它去找的是哪个路径。

常见情况：

- **点暂停没反应** —— `enabled` 是不是 `false`；或者 DSH 版本变了，停止按钮不再在
  `[data-composer-card]` 里（见下面「限制」）。
- **点「残忍结束」弹窗又回来** —— 0.1.0 在客户端插件被热更新重复挂载时的 bug。0.1.1
  起用共享运行时保证同一页面只有一套拦截器；刷新一次页面即可。
- **弹窗是占位鱼** —— 立绘没加载出来。看 `status` 和 `image` 两条路由。
- **图换了还是旧的** —— 这个插件自己发 `Cache-Control: no-store`；若还旧，确认改的是
  `status` 里那条路径指向的文件。

---

## 工作原理（为什么这样写）

停止按钮是官方输入框自带的主按钮，官方没有给它留插槽。插件能拿到的座位
（`conversation.input.*`、`conversation.composer.dock`）都在它旁边，换不掉它。

所以网页半侧在 `window` 的**捕获阶段**接住点击、拦下 React 的 `onClick`，弹窗确认后
再把这一下**补发**给原来那颗按钮。真正的停止逻辑仍然由官方按钮执行——插件不碰会话、
不碰模型、不碰权限，也不发任何网络请求。

第二页的「再见」不会补发点击，它只是关掉弹窗——所以对话继续；只有那个极小的
「狠心结束」才会走到补发这一步。

认出停止按钮的三条依据：

1. 在 `[data-composer-card]` 里面（别处的方块按钮不接管）；
2. `aria-label` 是 `停止生成` / `Stop generating` 这类本地化文案；
3. 兜底：图标是 10×10 的方块（停止图标），且不是发送/排队按钮。

两个防重复的细节：

- **只接管真实点击**：程序合成的 `.click()`（比如插件自己补发的那一下）不会被当成
  用户操作；
- **同一页面只有一套监听器**：DSH 的客户端插件热更新可能把同一个 bundle 再 apply
  一次，重复挂载时会先把旧的一套拆掉，bypass 也放在共享运行时里。

---

## 限制

- 只拦**鼠标点击（以及键盘激活）停止按钮**。键盘快捷键 `Esc Esc`（官方停止快捷键）
  没有被接管——想体验整活，请用鼠标点。
- 立绘建议横版或方构图、主体偏上；竖图会被裁掉上下。
- 依赖官方输入框的 `data-composer-card` 标记；DSH 大改版时若标记改名，拦截会失效
  （失效时不会报错，只是恢复成普通的停止按钮）。

---

## 安装 / 卸载

### 给别人用（从 GitHub 或发布包）

**方式一：从仓库 link**

1. 把仓库 clone 到本地，例如 `C:/plugins/worse-pause`；
2. 在 `%USERPROFILE%\.dsh\profiles\<你的 profile>\package.json` 的 `dependencies` 里加：
   `"dsh-plugin-pause-prank": "link:C:/plugins/worse-pause"`；
3. 在同一个文件的 `dsh.profile.bundles` 数组末尾加 `"dsh-plugin-pause-prank"`；
4. 在 profile 目录执行 `pnpm install`；
5. **完全重启 DSH**。

**方式二：从 Release 的 `.tgz`**

```powershell
pnpm add "file:C:/下载/dsh-plugin-pause-prank-1.0.0.tgz" --dir "$env:USERPROFILE\.dsh\profiles\desktop"
```

然后把 `"dsh-plugin-pause-prank"` 追加进 `dsh.profile.bundles`，并重启 DSH。

### 本机安装状态

已经装进 `%USERPROFILE%\.dsh\profiles\desktop`：

- `package.json` 的 `dependencies` 里有
  `"dsh-plugin-pause-prank": "link:C:/Users/lin/Desktop/dsh-plugin-pause-prank"`；
- `package.json` 的 `dsh.profile.bundles` 末尾有 `"dsh-plugin-pause-prank"`。

**改过插件代码之后要完全退出 DSH 再打开**（只刷新页面不够：宿主半侧和网页半侧的代码
都缓存在这次启动里）。只在运行时换立绘 / 图片文件则不用重启。

卸载：把这两处删掉，再在 profile 目录跑一次 `pnpm install`（或直接用 DSH 的插件页面关掉）。

---

## 关于名字

- 中文名：**更差的暂停**
- 英文名：**An Even Worse Pause**
- npm 包名：`dsh-plugin-pause-prank`（npm 包名只能 ASCII；DSH 里按这个名称安装）
- GitHub 仓库名建议：`worse-pause`（GitHub 仓库名不支持中文；中文名放在 README 和仓库描述里）

---

## 开发与测试

```bash
node test/host.test.mjs   # 宿主半侧：路由、图片字节、自检、路径解析、配置默认值
node test/pure.test.mjs   # 网页半侧：模块格式、停止按钮识别
npm test                  # 两个都跑
```

浏览器端到端自检（用 Edge / Chrome 无头模式打开即可）：

```
test/harness.html?selftest=1   # 全部路径自动跑,页面底部输出 ✓/✗(会先模拟重复挂载)
test/harness.html?open=1       # 直接打开弹窗看效果
test/harness.html?open=1&cruel=1  # 直接看第二页(大「再见」+ 小「狠心结束」)
test/harness.html?open=1&noimg=1  # 看立绘加载失败时的占位
test/harness.html?double=1     # 模拟"同一个 bundle 被热更新再 apply 一次"
```

`harness.html` 用假的 DSH 输入框（`[data-composer-card]` + `aria-label="停止生成"`）驱动
真实的 `client.js`，不需要启动 DSH。

## 目录

```
index.js            宿主半侧:图片路由、自检路由、首帧配置注入
client.js           网页半侧:拦截停止点击、拟人弹窗、兜底占位
cordis.patch.yml    插件自己的 Loader 行与默认文案
assets/persona.png  默认立绘(换这个文件就行)
docs/               预览截图
test/               宿主/纯函数测试 + 浏览器预览页
```
