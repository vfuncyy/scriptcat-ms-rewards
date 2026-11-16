# 微软bing rewards积分获取（持续优化版）

脚本猫（ScriptCat）用户脚本 —— 自动完成 Microsoft Rewards 每日任务，并通过浏览器通知 / 微信（PushPlus）推送进度与日报。

> 版本：v2.1.0 · License：MIT
> 基于开源原版「微软积分（持续修复版）」迭代，本仓库版本已重构推送模块，并适配 2026-11 新版站点（纯服务端渲染 + 懒加载 Server Action）。
> v1.7.0 起脚本更名为「微软bing rewards积分获取（持续优化版）」，功能与存储键保持兼容（`@storageName` 未变，升级不会丢配置）。

---

## ✨ 功能特性

- **签到**：PC 端 + APP 端双通道每日签到，失败自动补签
- **阅读**：新闻阅读任务，动态解析 Server Action 上报
- **搜索**：真实热词池搜索 + 随机间隔，模拟真人行为；配额取 DAPI 搜索任务与 dashboard 服务端数据
- **任务**：每日任务集、活动卡片、待领取积分（Server Action 自动领取）、连续签到奖励自动领取
- **需人工分类**：v1.8.0 新增，Quiz 卡、+10 带锁拼图、App 内搜索卡、等级不足卡会被识别并跳过，在日报里计为「需人工」而不再当成失败重试
- **推送**：半程进度提醒、每日日报、异常提醒（异常按 6 小时/同 key + 每小时 3 条节流）
- **调度**：crontab 每 20 分钟后台运行；运行锁防并发；**每天固定运行，不会因为前几天已完成而跳过整日**
- **控制台面板**：v2.0 新增，运行状态 / 调试信息 / 诊断数据统一成暗色可视化面板——指标条（今日得分、任务完成、余额、连续签到）+ 任务队列行 + 实时日志 + 可折叠原文，Shadow DOM 隔离宿主页样式，Esc 或点遮罩关闭
- **菜单即面板**：v2.1 起六个菜单项（手动授权 / 粘贴兑换授权码 / 运行状态 / 立即运行 / PushPlus 推送 / 诊断信息）点开就是对应面板，不再弹 `prompt`、`confirm`、`alert`；带输入框、开关、提示条与操作按钮，后台无 DOM 时自动退回旧行为

## 🆕 v2.1 / v2.0 变更与已知限制

**v2.1 做了什么：菜单即面板**

六个菜单项全部从原生弹窗改成对应面板，点开即见，不用再在 `prompt` 里读一行说明、再猜该输 `1` 还是 `2`：

| 菜单项 | 面板内容 | 交互 |
| --- | --- | --- |
| 🔑 手动授权 | 四步流程说明 + 授权链接（可复制） | 「打开授权页面」「复制链接」 |
| 📋 粘贴/兑换授权码 | 多行输入框（留空 = 用设置面板里已填的链接） | 「兑换」异步兑换 Token，结果回写提示条；「清空输入」 |
| 📊 运行状态 | 指标条 + 任务队列 + 账号与推送日志 + 纯文本 | 「立即运行」「刷新」「关闭」，数据异步补齐 |
| 🚀 立即运行 | 本轮五步顺序说明 | 「开始运行」 |
| 🔔 配置 PushPlus 推送 | 开关 + Token（密码框）+ 动态摘要 | 「保存」「发送测试」「清空 Token」「关闭」 |
| 🔧 诊断信息 | 两种输出说明 | 「查看调试信息」「导出诊断 JSON」「关闭」 |

为此 `Utils.showPanel(opts)` 新增了 `opts.fields` 表单能力（`checkbox` / `text` / `password` / `textarea`，支持 `label`、`placeholder`、`hint`），按钮回调第三个参数拿到 `api`：`values()` / `setValue()` / `focusField()` / `setNote()` / `setFields()` / `close()`。`setNote()` 可随时改写顶部提示条（原来提示条只在建面板时能设一次，空值会把整条 `display:none` 掉，改为 `hidden` 后可以再次显示）。所有入口都保留 `if (!panel)` 兜底——后台上下文拿不到 DOM 时仍走旧逻辑，不会因为改了界面而丢功能。

**v2.0 做了什么：界面重做 + 功能收敛**

v2.0 是**界面重做 + 功能收敛**的一次大版本：把以前散落在 `alert` / `prompt` 里的信息统一收进暗色控制台面板，同时**移除一条始终没能跑通的通道**。

**做了什么**

- 面板内核重写：`Utils.panelCss()` + `Utils.buildPanelModel()` + `Utils.showPanel()`，Shadow DOM + `adoptedStyleSheets` 隔离样式，不再往宿主页里塞内联样式
- 四个入口全部改用新面板：📊 运行状态、🔧 调试信息、🧪 诊断数据、跨上下文回显（后台触发时自动在 Rewards 页弹出）
- 面板内容分四层：顶部指标条（今日得分 / 任务完成 / 账户余额 / 连续签到）、任务队列（授权 Token、PC 签到、App 签到、PC 搜索、新闻阅读、日常任务、任务卡、活动卡片、待领取积分，五态 `✓ ◐ · – !`）、等宽日志区、可折叠的「完整原文」（复制用）
- 指标条数值来自 `API.getServerStats()`，面板先秒开、数据回来再刷新，不阻塞
- 删除零引用的 `Utils.showTextPanel` 与全部面板内联样式代码

**已知限制：桌面应用周任务已移除**

v1.8.0 曾尝试用 Rewards 桌面客户端身份（伪造 `MSRewards/Desktop` UA + `X-MSRewards-App: 1` + `X-Rewards-Source: msrewards-desktop`）接「`WW_pcparent_RewardsApp_weekly` 周卡」：拉 `/earn` → 解析 `*_pcchild*` 子项 → 应用内搜索走 `bing.com/rewardsapp/reportActivity` → 交卷走 `reportActivity` Server Action（`[hash, 11, {offerid, isPromotional, timezoneOffset}]`）→ 回读复核。

结果：**子项的搜索上报能成功，但交卷长期 HTTP 500**。v1.8.2 加 payload 样本日志与告警收敛、v1.8.5 加连接层详情与连续失败熔断，逐轮排查后确认根因是**服务端 Origin 白名单 —— 浏览器不允许 GM_xhr 自定义 `Origin`**，不是 action id 过期、也不是载荷格式问题。这条通道在当前「浏览器用户脚本」架构下走不通，v2.0 把整段落连同配置项一起删除，而不是留着一个永远失败的开关。

> 需要周任务积分的话，只能人工在 Microsoft Rewards 桌面/手机 App 里完成，脚本不再代做，也不会再在日志里刷黄色告警。

## 📲 推送渠道

| 渠道 | 说明 |
| --- | --- |
| 浏览器通知 | 默认开启，脚本菜单「🔕/🔔」可切换 |
| PushPlus（微信） | v1.5.0 新增；扫码登录 [pushplus.plus](https://www.pushplus.plus/) 后首页获取 token |

> v1.5.0 起**已移除** WorkBuddy 本机服务推送与通用 Webhook 推送的全部代码与配置项。

**PushPlus 配置步骤**：

1. 微信扫码登录 pushplus.plus，复制首页的 token；
2. 脚本菜单 →「🔔 配置 PushPlus 推送」→ 输入 `1` → 粘贴 token；
3. 菜单 →「📢 测试通知」验证（结果见脚本日志：「🔵 已受理」/「🔴 出错」）。

也可在脚本设置面板 `Notice` 分组中直接填写 `PushPlus Token`。

## ⬇️ 下载

- **ScriptCat 商店（推荐）**：[scriptcat.org](https://scriptcat.org/zh-CN/script-show-page/9092) · 一键安装 <https://scriptcat.org/scripts/code/9092/%E5%BE%AE%E8%BD%AFbing%20rewards%E7%A7%AF%E5%88%86%E8%8E%B7%E5%8F%96%EF%BC%88%E6%8C%81%E7%BB%AD%E4%BC%98%E5%8C%96%E7%89%88%EF%BC%89.user.js>
- **最新版直链**：[microsoft-rewards-scriptcat.user.js](https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-scriptcat.user.js)
- 历史版本：[Releases 页面](https://github.com/vfuncyy/scriptcat-ms-rewards/releases)

> 脚本头部已声明 `@updateURL` / `@downloadURL`（始终指向最新 Release 资产）：在脚本猫中开启「检查更新」即可自动升级到最新版。
>
> 商店版本从 GitHub 自动同步。

## 📦 安装使用

1. 浏览器安装 [脚本猫 ScriptCat](https://scriptcat.org/) 扩展（Chrome / Edge / Firefox）；
2. 安装脚本：在 [ScriptCat 商店](https://scriptcat.org/zh-CN/script-show-page/9092) 点「安装」，或把 `微软bing rewards积分获取（持续优化版）.user.js` 导入脚本猫（拖入扩展或新建脚本粘贴全文）；
3. 首次使用：脚本菜单 →「🔑 手动授权」→ 登录微软账户完成 OAuth 授权；
4. 之后由 crontab（`*/20 * * * *`）自动运行，无需人工干预；
5. 自动更新：脚本已内置 `@updateURL`/`@downloadURL`，在脚本猫中开启「检查更新」后，新发布的 Release 会自动拉取升级（随附的 `script.options.json` 已默认开启）。

## ⚙️ 配置说明

设置面板分三组：

- `Config`：常驻后台、运行锁、搜索间隔、授权码接口等
- `Tasks`：签到 / 阅读 / 活动卡 / 问答 / 搜索 五项任务开关
- `Notice`：浏览器通知开关、PushPlus 开关、PushPlus Token

常用菜单：🔑 手动授权 · 📋 粘贴/兑换授权码 · 📊 运行状态 · 🚀 立即运行 · 🔔 配置 PushPlus 推送 · 🔧 诊断信息 · 🔕/🔔 浏览器通知

## 🧩 工作原理（模块速览）

| 模块 | 职责 |
| --- | --- |
| 元数据头 | `@connect` 声明微软业务域、热词接口域与 pushplus.plus；`@match` 覆盖 OAuth 回调页与 Bing/Rewards 页面 |
| UserConfig | 设置面板三组配置，与菜单读写同一批存储键 |
| 登录回调捕获 | 在 `oauth20_desktop.srf` 截获 OAuth code，兑换并续期 access token |
| RewardsAuto | UA / offerId / 搜索词池 / 跳过规则等常量与运行状态（含兜底的领取 action id） |
| PushPlus | 推送配置读取与就绪判定（endpoint、token、开关） |
| Utils | 缓存（TTL+单飞）、安全 UI 封装、三通道 `log()`、通知状态按日去重、`sendPushPlus()`、带退避重试的 `xhr()`；v2.0 新增 `panelCss()` / `buildPanelModel()` / `showPanel()` 面板内核（Shadow DOM 隔离） |
| API 层 | token 生命周期、**dashboard 服务端渲染解析**（余额/等级/连签/待领取）、DAPI 511 字段适配、阅读与卡片（Server Action 动态解析）、搜索（热词 + 配额）、区域检查 |
| 自动领取 | 两跳定位懒加载 chunk 里的 `reportClaimAllPoints` action id → `POST /dashboard`（`Next-Action` 头 + `[]`）→ 余额复核 |
| TaskManager | 运行锁、完成调度、六项任务执行（阅读 / 签到 / 活动卡片 / 搜索 / 连签检测 / 每日活动 + 待领取）、报表汇总、收尾推送 |
| 菜单系统 | 授权 / 兑换 / 状态 / 立即运行 / 推送配置 / 测试通知 / 调试导出 |
| init | crontab 注册；Bing 搜索页跳过初始化；登录回调页立即兑换 token |

## 🗂️ 文件结构

```
scriptcat-ms-rewards/
├── 微软bing rewards积分获取（持续优化版）.user.js   # 主脚本（直接导入脚本猫）
├── script.options.json                 # 脚本猫选项元数据（含 @connect 声明）
├── script.storage.json                 # 存储快照示例（令牌已脱敏置空）
├── 主页实测与改进清单.md                # 2026-11 新版站点实测证据与 16 项改进清单
├── 参考脚本对比与采纳建议.md            # 与商店同类脚本（7354/8787/8491）的能力差与采纳路线
└── README.md
```

## 🔐 安全说明

- 微软登录凭据（access token）仅保存在本机脚本猫存储中，**不会**出现在本仓库；
- 仓库内 `script.storage.json` 为结构示例，真实令牌字段已置空；
- PushPlus token 请自行注册获取，勿使用他人 token。

## 🔧 改动记录

### v2.1.0（菜单项全部改为面板 + 面板获得表单能力）

**1. 六个菜单项改为面板**

| 菜单项 | 之前 | 现在 |
| --- | --- | --- |
| 🔑 手动授权 | 直接开标签页，没有任何说明 | 面板：四步流程 + 授权链接可复制 + 「打开授权页面 / 复制链接」 |
| 📋 粘贴/兑换授权码 | `prompt` 粘贴 → `alert` 结果 | 面板：多行输入框 + 「兑换」（异步，结果回写提示条）+「清空输入」 |
| 🚀 立即运行 | 点完立刻开跑，无确认 | 面板：本轮五步说明 + 「开始运行」 |
| 🔔 PushPlus 推送 | `prompt` 选 `1/2/3/9/0`，选项写在说明里 | 面板：开关 + Token 密码框 + 动态摘要 + 「保存 / 发送测试 / 清空 Token」 |
| 🔧 诊断信息 | `prompt` 选 `1/2/0` | 面板：「查看调试信息」「导出诊断 JSON」 |
| 🔕 通知开关 | 点一下直接反转并刷新页面 | 面板：开关 + 「保存并刷新」 |

每个入口都保留 `if (!panel)` 分支，后台上下文拿不到 DOM 时仍按旧逻辑执行——换界面不牺牲「后台也能用」。

**2. `Utils.showPanel` 新增表单能力**

- 新增 `opts.fields`，支持 `checkbox` / `text` / `password` / `textarea` 四种字段，字段可带 `label`、`placeholder`、`hint`、`rows`
- 按钮回调签名扩展为 `onClick(area, close, api)`，`api` 提供 `values()`、`setValue(key, value)`、`focusField(key)`、`setNote(text)`、`setFields(fields)`、`close()`
- 返回句柄新增 `setNote(text)`、`setFields(fields)`
- 提示条改为常驻 DOM（`hidden` 切换）而不是空值直接 `display:none`，因此 `setNote()` 可以「先隐藏、后重新显示」；回调抛错会被统一写进提示条，异步回调的 rejection 也不会变成未处理拒绝
- 字段区固定排在滚动区最前面（表单面板里表单是主体，任务行退居其次），并保证 `setRows` 二次调用不会把任务行顶到字段上方

**3. 顺手修掉的两个真问题**

- `setStats()` 异步回填时用 `body.prepend(statsEl)`，会把指标条塞进滚动区——滚动任务行时数值跟着滚走。改为挂在 `card` 内、`body` 之前，指标条常驻可见
- 面板首次渲染时 `.stats` 是 `card` 直接子节点、但 `setStats` 又用另一条路径插入，两条路径不一致；现在统一为「不在 DOM 才插，且插在 `body` 前」

**4. 版本与体积**

- `@version` 与 `engineVersion` 双升 `2.1.0`；业务判定与重置逻辑未变
- `@description` 补上「六个菜单项都改成可视化面板」
- 脚本 5,065 行 / 282,752 B → **5,340 行 / 297,781 B**（+275 行 / +15,029 B，含面板表单内核与六个入口的面板代码）

### v2.0.0（控制台面板重做 + 移除桌面周任务）

这一版两条主线：**界面**全部重做，**功能**收敛掉一条验证失败的通道。

#### 1. 暗色控制台面板（新增）

| 方法 | 职责 |
| --- | --- |
| `Utils.panelCss()` | 返回整段面板 CSS，注入 Shadow DOM；`:host` 上定义 `--pc-bg / --pc-surface / --pc-fg / --pc-muted / --pc-border / --pc-accent` 等变量，宿主页样式无法污染面板 |
| `Utils.buildPanelModel(stats, extra)` | 把 `API.getServerStats()` 的结果转成「4 项指标 + 9 行任务队列」，`statusOf()` 统一输出 `ok / run / wait / skip / fail` 五态 |
| `Utils.showPanel(opts)` | 面板外壳：overlay + 卡片 + 头部 + 指标条 + 任务行 + 日志区 + 可折叠原文 + 底部按钮；Esc 与点遮罩关闭；返回 `{setText, setRows, setStats, appendLog, close}` 句柄 |

- 样式隔离用 `new CSSStyleSheet()` + `adoptedStyleSheets`，不支持时回退 `<style>`；**不新增 `@grant`**（没有 `GM_addStyle` 也能用）
- 四个入口全部接上：📊 运行状态、🔧 调试信息、🧪 诊断数据、跨上下文回显
- 运行状态面板先秒开显示骨架，`API.getServerStats()` 回来后异步填充指标，不阻塞菜单
- 调试面板把原来的 `Utils.safeAlert(note)` 打断改为面板顶部提示条；诊断面板按 `report.endpoints` 生成 ✓/✕ 覆盖行
- 补了细滚动条、`:focus-visible` 描边、`prefers-reduced-motion` 关动画、420px 以下转 2 列指标

#### 2. 移除桌面应用周任务（整段删除）

- 删除 `doDesktopWeeklyQuests()`（约 11.7 KB）、`RewardsAuto.desktopAppHeaders`、`Tasks.desktop` 配置项、`kindText.desktop_app`、`claimCard` 里的桌面头分支、日报的「🗓️ 周任务」字段、`TaskManager` 的 4 个 desktop 计数
- 失败原因见上文「🆕 v2.0 变更与已知限制」：**子项搜索上报成功、交卷长期 HTTP 500，根因是服务端 Origin 白名单 + 浏览器不允许自定义 `Origin`**

#### 3. 其它清理

- 删除零引用的 `Utils.showTextPanel`（旧面板 API，三个调用点早已迁到 `showPanel`）
- `@description` 去掉周任务措辞、补上 v2.0 面板卖点
- `@version` 与 `engineVersion` 均升到 `2.0.0`；重置逻辑不变（只清当日尝试计数，不含「已完成」标记），重复执行无副作用
- 脚本行数 5,319 → **5,065 行**；体积 298,766 B → **282,752 B**（相比「加完面板但周任务还在」的中间态 **−16,014 B / −254 行**）
- 相对 v1.8.6 发布版（273,166 B / 4,858 行）净增 **+9,586 B / +207 行**——增量来自新面板内核（实测 21,057 B：`panelCss` 6,541 + `buildPanelModel` 4,596 + `showPanel` 9,920），周任务与旧面板的删除量抵掉了一部分

### v1.8.6（代码整理：删死代码 + 合并重复实现）

- 🧹 **删除 5 个零引用方法**：`Utils.waitForElement`、`Utils.waitForElementsByText`、`API.appActivity`、`API.getRewardsToken`、`API.getNextActionHash`（合计约 107 行，全脚本无任何调用点）
- 🧩 **合并 3 份手写 JSON 括号配平**：`pointsCounters` / `activityCards` / `pointsHistory` 原来各写一套 `depth++` 扫描循环，现统一用新增的 `Utils.jsonBlock(text, key, maxLen)`，`getServerStats` 里的 `grabBlock` 也改为一行委托
- 📏 **整理 `_fetchRewardsInfo`**：删掉多余的 `if (balance === 0)` 包裹，把 6 条「先 HTML 正则、再 JSON 正则」的兜底收成一个 `pick()` 小工具，函数从 155 行降到约 128 行
- 🎛️ **合并 8 处 DAPI 请求头**：新增 `API.dapiHeaders(token, region, withPartner)`，`x-rewards-appid` / `x-rewards-ismobile` / `x-rewards-country` 等常量各只保留一处定义，避免将来改一处漏七处
- 📝 修正两段错位的 JSDoc（`_isAppSearchCard` 与 `_cardBlockReason` 的说明互相串了）
- ⚙️ 纯代码整理，**不改任何业务判定与请求内容**；`info.mobile` 字段保留（国际版账号仍有手机配额，国内恒为 0 只是分支空转）

> 说明：脚本体积从 281778B 降到约 272909B（约 -3.1%），运行时行为与 v1.8.5 一致。

### v1.8.5（周任务交卷排障增强）

- 🧾 **保留服务端响应体**：`Utils.xhr` 遇 4xx/5xx 不再只抛状态码，改为把 `responseText`（截断 400 字符）挂到错误对象上；此前 30 天只能看到「HTTP 500」，看不到服务端说了什么
- 🔍 **连接层失败可读化**：`onerror` 原来只取 `err.error`（绝大多数情况就是字符串 `Unknown Error`），现在把 `status` / `readyState` / `responseText` 长度 / 字段名一并落日志，用来区分「被 WAF 掐断」「扩展层拒绝」还是「真断网」
- 🔥 **连续失败熔断**：周任务子项连续 2 项交卷失败即停止本轮剩余子项，避免 6 连发把风控触发得更狠，并明确打出「剩余 N 项未尝试」
- 🩺 500 告警文案直接带上响应体，一轮日志就能定位根因，不必再开调试开关
- ⚙️ 仅排障增强，不改变任何业务语义；版本重置只清当日尝试计数，不含「已完成」标记

### v1.8.4（应用内搜索上报对齐真实页面协议）

- 🧭 **直接使用卡片原始地址**：应用卡改为导航到 `destination` 的完整地址（只把 `www.bing.com` 换成当前生效的 host），不再自己拼 `?q=&form=`，站点附加的追踪参数一个不丢
- 🔢 **IID 取自页面**：真实页面调 `sj_rra` 用的是 `window.data_iid`（如 `SERP.5057`），脚本此前硬编码 `SERP.5047`；现在新增 `Utils.extractIID()` 从搜索页 HTML 的 `data_iid="SERP.xxxx"` 读取，取不到才回退
- 🧾 **上报参数对齐**：`reportActivity` 的查询串改用目标地址的原始 `location.search`，body 里的 `url` 改成和真实 `escape()` 一致的编码（`/` 不转义），不再用 `encodeURIComponent` 整体重排
- 📱 **保留移动端回执日志**：`上报回执: IsAuthenticated=… RewardsIncrement=…` 仍每张卡打一行，用于判断是否真正记账
- 🧩 版本升级重置当日尝试态，当天被旧逻辑标记过的卡会再试一次

> 已知边界：这条链路今天已验证「上报会被受理（`IsAuthenticated=true` / `RewardsIncrement=1`）但不一定记账」；v1.8.4 是对齐真实页面协议的一次尝试，能否到账需次日跑一轮才能确认。

### v1.8.3（手机端搜索适配 + 手机配额补跑）

- 📱 **App 内搜索卡放开（`form=ML2W4J` / `form=ML2Y2H`）**：这类卡以前直接跳过（日志「需 App 内搜索：该卡只认 Rewards 手机客户端内的搜索」），现在改为以移动端身份真实打开搜索页并上报，成功后回查卡片状态，失败才回退到原有 DAPI / Server Action 策略
- 🍪 **请求头注入 `_Rwho`**：以 `_Rwho=u=m&ts=当天` 标记移动端身份，**拼在浏览器真实 Cookie 之后**（只发 `_Rwho` 会顶掉 MSPAuth/MUID，服务端回 200 但 `IsAuthenticated=false`，卡片永不记账）；PC 搜索则显式打 `u=d`
- 🔍 **IG 取自搜索页**：`ncheader` 与 `reportActivity` 改用页面里的 IG，不再用随机 UUID（随机 IG 服务端照样回 200，但这次搜索不挂到当前会话，计数不涨）
- 🔢 **手机搜索配额补跑**：`pointsCounters.mobile` 此前只解析不消费，现在 PC 配额跑满后继续补跑手机端（上限 10 次，单轮内用估算进度推进），完成判定改为 PC 与手机都满
- 🧩 版本升级时重置当日尝试态，让此前被跳过的卡当天即可重试

> 说明：脚本不会修改浏览器真实 Cookie，`_Rwho` 只出现在脚本发出的请求头里；若服务端要求真 App 签名，此路径可能失效，但不影响签到/阅读/PC 搜索。

### v1.8.2（周任务交卷排障 + 免费次数回收）

- 🩺 **周任务交卷 500 排障**：交卷每轮打印一次完整 payload 样本与 action id，逐项回执原文写入调试日志；HTTP 500 由「每个子项一条黄字」改为「每轮只告警一次」，其余写调试缓冲（打开调试日志可在「🔧 诊断信息」查看），不再每天刷 6 条
- 🔁 **活动卡片 / 每日活动尝试次数修复**：改为「成功即清零、失败才累计、上限 3」，避免偶发失败耗尽 3 次后当天彻底罢工；升版时重置旧尝试态
- 🖥️ 伪装桌面客户端 UA 由 1.4.56 升到 **1.12.0.0**（与本机 Microsoft Rewards 桌面应用版本一致）
- 🧾 日志文案更正：搜索配额兜底原写「getuserinfo 兜底」，实际早已改走 dashboard 服务端数据，文案同步更正

> 提示：若「🟢 检查脚本更新」每轮报 `Failed to fetch`，是从 ScriptCat 商店安装时商店 meta.js 覆盖了更新源导致，需从 GitHub Release 直链重装，或在 ScriptCat 里把该脚本的更新地址改回 Release 直链。

### v1.8.1（菜单整理）
- 🧭 菜单从 10 项精简到 7 项：三个授权入口收敛为「🔑 手动授权」+「📋 粘贴/兑换授权码」（弹窗留空即读取设置面板里的授权码）
- 🏷️ 「🚀 立即运行（忽略次日锁定）」改为「🚀 立即运行」——跨日跳过逻辑已于 v1.8.0 删除，旧标签会误导
- 📊 「Token 状态」升级为「运行状态」：同时显示今日 4 项任务进度、浏览器通知与推送目标、脚本版本
- 🔔 「配置 PushPlus 推送」新增第 3 项「发送测试消息」，「📢 测试通知」不再单列；顺带修掉测试推送文案被日志覆盖的老问题（以前推出去的是「测试通知已发送」而不是自定义文案）
- 🔧 「🔧 调试信息」与「🧪 导出诊断数据」合并为「🔧 诊断信息」（1 查看调试信息 / 2 导出完整 JSON）；导出已不再探测已下线的 `/api/getuserinfo` 与无 counters 的 `options=613`，改为采集 dashboard RSC 数据与领取动作 ID

### v1.8.0（每天必跑 + 桌面周任务 + 需人工分类 + 通知节流）

> ⚠️ 本节中的「桌面应用周任务」已在 v2.0 整段移除（交卷长期 HTTP 500，根因是服务端 Origin 白名单），保留此记录仅作历史追溯。

- ❌ **彻底删除「连续 3 天全部完成后次日跳过」的跨日调度**（`readCompletionSchedule` / `isWaitingForNextDay` / `recordCompletion` 三个方法与全部调用点）。脚本现在**每天都会运行**，只要当天还有未完成项就继续补做；唯一的跳过是同轮并发保护（运行锁）
- ✅ 新增**桌面应用周任务** `doDesktopWeeklyQuests()`：用 MSRewards 桌面客户端身份（UA + `X-MSRewards-App`）访问 `/earn`，定位 `WW_pcparent_RewardsApp_weekly` 周卡，解析 `pcchild` 子项，应用内搜索走 `rewardsapp/reportActivity`，交卷走 Server Action（`reportActivity`），最后回读复核（**v2.0 已移除**）
- ✅ 新增**卡片原因分类** `_cardBlockReason()`：Quiz 卡（需落地页点答案）、`VerB_Locked_level` 带锁拼图（+10 只能真拼）、`form=ML2W4J/ML2Y2H` 应用内搜索卡、等级不足卡，命中即跳过并计入「需人工」，不再反复重试污染失败计数
- ✅ 新增**通知分层节流**：同一异常 key 6 小时内只推一次，全局每小时最多 3 条，超限只写日志；日报/完成通知不受影响
- ✅ 日报新增「🗓️ 周任务 x/y」（**v2.0 已移除**）与「需人工 N」两项
- 📄 新增「开源致谢」注释块与 README 感谢名单

### v1.7.0（更名 + 参考脚本对照结论）

- ✅ 脚本更名为 **微软bing rewards积分获取（持续优化版）**；`@storageName` 未变，升级不丢配置与登录态
- ✅ 新增 `@tag` 元数据（ScriptCat 商店标签从代码解析）
- ✅ 新增启动间隔自检 `checkStartupGap()`：距上次成功运行 ≥12 小时时补一条告警（同类每天最多推一次），用于发现「定时被宿主跳过 / 扩展被禁用 / 浏览器长期未开」
- 📄 新增 `参考脚本对比与采纳建议.md`：对照商店同类脚本 7354（页面助手）、8787（后台 + CDP）、8491（本脚本上游）的能力差，给出 7 项采纳路线

### v1.6.0（适配 2026-11 新版站点）

微软 Rewards 站点已于 2026-11-13 改版为 Next.js 纯服务端渲染（RSC），旧接口大面积下线。本版按实测证据逐条修复：

- ❌ 移除 `/api/getuserinfo` 全链（实测 401）：配额、余额、完成状态回查改用 **dashboard 服务端渲染解析 + DAPI options=511**
- ❌ 移除 `/api/reportactivity` 全链（实测 POST 401）与「老版 reportactivity」兜底策略，避免假成功
- ❌ 移除 `/api/reportactivity` 相关的防伪 token 获取与诊断探测
- ✅ 新增 `parseDashboardHtml()` / `rscText()` / `getDashboardData()`：从 `self.__next_f.push` 拼装 RSC 文本，解析余额、等级、每次搜索积分、连签天数、`pointClaim` 待领取积分、每日活动过期时间
- ✅ 新增自动领取：两跳定位懒加载 chunk（`PointsClaimSidePanel`）中的 `reportClaimAllPoints` action id（**实测 id 为 42 位十六进制**，旧正则写死 40 位会漏匹配），`POST /dashboard` + `Next-Action` 头 + `[]` → RSC 返回 `1:true`；随后 DAPI 余额复核（实测 17511 → 17514，+3 到账）
- ✅ DAPI 字段适配：服务端已不下发 `offerid/type/pointProgressMax` 到顶层，改从 `name` 与 `attributes` 读取，并按 offerId 规则推断类型（`_classifyOffer`）
- ✅ 搜索配额改为 DAPI 搜索任务（`WW_search_*`，60/60）+ `pointsPerSearch`（3 分/次），不再依赖页面中文文案
- ✅ 连签天数优先取 RSC `streakCounter`（实测 50 天）
- ✅ 新增 `Sapphire_AppNewBonus_*` 四类 App 专属奖励统计（需在手机 App 内触发，脚本只统计不谎报）
- ✅ 每日活动按 `Gamification_DailySet_*_<今日>_ChildN` 过滤，避免把次日预热项提前上报
- ✅ `Config.engineVersion` 升到 1.6.0，升级时重置一次当日尝试状态

### v1.5.1

- ✅ 新增 `@updateURL` / `@downloadURL`（指向 Releases 最新版直链），脚本猫可自动检查并拉取更新
- ✅ 补充 `@homepageURL` / `@supportURL` 元数据
- ✅ `script.options.json` 开启 `check_for_updates`
- 业务逻辑无改动

### v1.5.0（本仓库）

- ❌ 删除 WorkBuddy 本机服务推送与通用 Webhook 推送全链路（配置项、PushTargets、sendWebhook、菜单、`@connect` 本机域名）
- ✅ 新增 PushPlus 微信推送（`Notice.pushplus` 开关 + `Notice.pushplusToken`，`template=txt` 保留换行）
- ✅ 菜单「🔔 配置 PushPlus 推送」「📢 测试通知」适配新渠道
- ✅ `script.options.json` 的 `orig_connects` 同步（移除 `127.0.0.1`、`localhost`，新增 `pushplus.plus`）

### v1.4.0 及以前

- 原版功能：签到、阅读、搜索、每日任务集、连续签到、WorkBuddy/Webhook 推送等。

## 🙏 感谢

本脚本站在这些开源作品的肩膀上，特此致谢（按对本脚本的影响排序）：

| 项目 | 作者 | 仓库 | 对本脚本的帮助 |
| --- | --- | --- | --- |
| 微软积分（持续修复版） | yehai | <https://gitee.com/yehai/bing-rewards> | **本脚本的直接上游**：整体任务编排、运行锁、签到/阅读/搜索/日常流程均源自此项目 |
| 微软积分（优化版） | hidmould | <https://github.com/hidmould/MicrosoftPoints> | v1.8.0 的「需人工分类」与「通知节流」结论直接来自其代码注释中的实测记录（Quiz 卡必须真作答、+10 带锁拼图必须真拼、应用搜索签名 `form=ML2W4J/ML2Y2H`、`PUBL=RewardsDO` 只是跟踪参数） |
| Get Microsoft Rewards (修复/增强版) | Muverix | <https://github.com/Muverix/Get-Microsoft-Rewards> | 等级门槛与「待领取积分」判定的思路（`lacksLevel` / `detectClaimableAmount`） |
| Get Microsoft Rewards | QingJ | <https://github.com/QingJ01> | 上述同类脚本的共同起点，本脚本的谱系源头 |

同时感谢：

- **ScriptCat（脚本猫）** 提供运行环境与分发平台：<https://scriptcat.org>
- hidmould 在其 README 中致谢的 **ScriptCat001、DuskLight、潘矩森** 等社区贡献者
- 以及所有在 Rewards 改版后无偿分享实测结论（接口下线、RSC 解析、Server Action 定位）的脚本作者

本项目继续以 MIT 协议开源，欢迎在此基础上继续修复。

## ⚠️ 免责声明

本项目仅供学习与研究。使用本脚本产生的一切风险与后果由使用者自行承担；请遵守 Microsoft 服务条款及所在地区法律法规；不得用于商业用途。MIT License。
