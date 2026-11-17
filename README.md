# 微软bing rewards积分获取（持续优化版）

脚本猫（ScriptCat）用户脚本 —— 自动完成 Microsoft Rewards 每日任务，并通过浏览器通知 / 微信（PushPlus）推送进度与日报。

> 版本：v3.0.0 · License：MIT
> 基于开源原版「微软积分（持续修复版）」迭代，本仓库版本已重构推送模块，并适配 2026-11 新版站点（纯服务端渲染 + 懒加载 Server Action）。
> v1.7.0 起脚本更名为「微软bing rewards积分获取（持续优化版）」，功能与存储键保持兼容（`@storageName` 未变，升级不会丢配置）。
> **v3.0.0 是单文件后台脚本**：参数全部收进脚本猫原生设置面板，不再需要（也不提供）任何配套的「控制台」页面脚本。

---
##❗️❗️❗️注意：实测发现有一个日常活动任务需手动点击，昨晚修到三点多发现还是行不通，涉及到每日签到任务和升级任务，特此提示。

## ✨ 功能特性

- **签到**：PC 端 + APP 端双通道每日签到，失败自动补签
- **阅读**：新闻阅读任务，动态解析 Server Action 上报
- **搜索**：真实热词池搜索 + 随机间隔，模拟真人行为；配额取 DAPI 搜索任务与 dashboard 服务端数据
- **任务**：每日任务集、活动卡片、待领取积分（Server Action 自动领取）、连续签到奖励自动领取
- **桌面应用周任务**：v1.8.0 新增，用 Rewards 桌面客户端身份完成「WW_pcparent_RewardsApp_weekly」周卡子项
- **需人工分类**：v1.8.0 新增，Quiz 卡、+10 带锁拼图、App 内搜索卡、等级不足卡会被识别并跳过，在日报里计为「需人工」而不再当成失败重试
- **推送**：半程进度提醒、每日日报、异常提醒（异常按 6 小时/同 key + 每小时 3 条节流）
- **调度**：crontab 每 20 分钟后台运行；运行锁防并发；**每天固定运行，不会因为前几天已完成而跳过整日**
- **调试**：Token 状态、调试日志环形缓冲、诊断数据一键导出

## 📲 推送渠道

| 渠道 | 说明 |
| --- | --- |
| 浏览器通知 | 默认开启，菜单「🔔 浏览器通知开关」可切换 |
| PushPlus（微信） | v1.5.0 新增；扫码登录 [pushplus.plus](https://www.pushplus.plus/) 后首页获取 token |

> v1.5.0 起**已移除** WorkBuddy 本机服务推送与通用 Webhook 推送的全部代码与配置项。

**PushPlus 配置步骤**：

1. 微信扫码登录 pushplus.plus，复制首页的 token；
2. 脚本菜单 →「⚙️ 打开设置（参数都在这里）」→ 在 `Notice` 分组填 `PushPlus Token`（v3.0 起**不再有**「🔔 配置 PushPlus 推送」这个交互菜单，原因见下）；
3. 把 `Notice.pushplus` 打开即生效；结果见脚本日志「🔵 已受理 / 🔴 出错」。

> **为什么菜单变少了**：本脚本是 `@crontab` 定时脚本，运行在 service worker / offscreen 里，**没有 `document`、没有 `prompt/alert/confirm`**。v1.8.6 及更早的六个菜单全都依赖 `Utils.safePrompt` / `Utils.safeAlert` / `Utils.showTextPanel`，点下去只能走空兜底 —— 这就是「点菜单没反应」的真正原因（也是 v2.x 一度拆出独立「控制台」页面脚本的起因）。v3.0 改为：**能改的东西全在设置面板里**，菜单只保留后台真能跑通的形态（打开标签页 / 立即执行 / 输入框 / 通知回执）。

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

- `Config`：持续检测、锁定国区、搜索间隔、搜索词接口、授权码链接
- `Tasks`：签到 / 阅读 / 活动卡 / 问答 / 搜索 / 桌面周任务 六项任务开关
- `Notice`：浏览器通知开关、PushPlus 开关、PushPlus Token

常用菜单（v3.0 起只剩 6 项，全部后台可用）：

| 菜单 | 行为 | 备注 |
| --- | --- | --- |
| 🔑 手动授权 | 打开 OAuth 授权页 | 回调页自动捕获 code 并兑换 |
| ⌨️ 粘贴授权码 | 弹输入框，粘贴跳转 URL 或裸码 | **只出现在扩展图标弹出的面板里**，右键子菜单不显示；留空=用设置面板里已填的码 |
| 📊 运行状态 | 把 Token / 今日进度 / 推送目标拼成一段文字 | 走浏览器通知 + PushPlus 回执，不弹面板 |
| 🚀 立即运行 | 立刻跑一轮任务 | 运行锁生效，不会和定时轮次撞车 |
| ⚙️ 打开设置（参数都在这里） | 打开脚本猫原生 UserConfig 表单 | 所有可调参数都在这里 |
| 🔔 浏览器通知开关 | 翻转 `Notice.bro` | 结果用通知回执 |

## 🔐 安全说明

- 微软登录凭据（access token）仅保存在本机脚本猫存储中，**不会**出现在本仓库；
- 仓库内 `script.storage.json` 为结构示例，真实令牌字段已置空；
- PushPlus token 请自行注册获取，勿使用他人 token。

## 🔧 改动记录

### v3.0.0（取消控制台，回归单文件后台脚本）

**这一版只解决一件事**：让「后台脚本 + 菜单」这套组合真正跑得通，不再需要另一个页面脚本来当控制台。

- 🗑️ **彻底删除 DOM 依赖层**：`Utils.safeAlert` / `safePrompt` / `safeConfirm` / `safeReload` / `showTextPanel` / `copyText`（含 `@grant GM_setClipboard`）以及 `showDebugInfo`、`exportDiagnostics`、`pendingDebugView` 渲染块。这些在 `@crontab` 环境里全部是「判断 `document` 不存在 → 返回 null / 空操作」的死代码，却是 v2.x 拆出控制台脚本的唯一理由。
- 🎛️ **参数统一进脚本猫原生设置面板**：`Config` / `Tasks` / `Notice` 三组照旧，填写即生效；新增「⚙️ 打开设置（参数都在这里）」菜单直接调 `CAT_userConfig()` 跳过去，用户不必再去扩展列表里翻。
- ⌨️ **授权码三入口，全部后台可用**：① 设置面板「授权码链接」（`GM_addValueChangeListener` 监听，写入即兑换）；② 菜单「⌨️ 粘贴授权码」（`CAT_registerMenuInput` 输入框，留空则用面板里已填的码）；③ 菜单「🔑 手动授权」+ 回调页自动兑换。
- 📊 **状态与结果改走通知回执**：菜单不再弹面板，而是把状态拼成一段文字，通过 `Utils.log(msg, push=true)` 发浏览器通知 + PushPlus，并写入 `Config.lastStats` 留档。
- 🧹 **菜单从 8 项收敛到 6 项**：🔑 手动授权 · ⌨️ 粘贴授权码 · 📊 运行状态 · 🚀 立即运行 · ⚙️ 打开设置 · 🔔 浏览器通知开关。
- 🔌 **新增 `@grant CAT_registerMenuInput` / `CAT_userConfig`**，补 `@connect 3g.qq.com`（`getIPInfo()` 的 referer 域名，此前静态检查一直报 connect 缺失）。
- 📉 **脚本体积 273166B → 246582B（-9.7%），4858 行 → 4369 行（-489 行）**；业务逻辑（签到 / 阅读 / 活动 / 搜索 / 桌面周任务 / 领分 / 推送 / 运行锁 / Token 生命周期）**一行未改**。
- ⚠️ **行为变化**：原先点「🔧 诊断信息」导出的 JSON、点「📊 运行状态」看到的弹窗，现在都不再出现；排查问题改用脚本日志 + 浏览器通知，或临时把 `Config.debugLog` 打开看环形缓冲。

### v2.X（尝试为脚本重构一个UI面板，发现与后台响应模块冲突，删了）

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

- ❌ **彻底删除「连续 3 天全部完成后次日跳过」的跨日调度**（`readCompletionSchedule` / `isWaitingForNextDay` / `recordCompletion` 三个方法与全部调用点）。脚本现在**每天都会运行**，只要当天还有未完成项就继续补做；唯一的跳过是同轮并发保护（运行锁）
- ✅ 新增**桌面应用周任务** `doDesktopWeeklyQuests()`：用 MSRewards 桌面客户端身份（UA + `X-MSRewards-App`）访问 `/earn`，定位 `WW_pcparent_RewardsApp_weekly` 周卡，解析 `pcchild` 子项，应用内搜索走 `rewardsapp/reportActivity`，交卷走 Server Action（`reportActivity`），最后回读复核
- ✅ 新增**卡片原因分类** `_cardBlockReason()`：Quiz 卡（需落地页点答案）、`VerB_Locked_level` 带锁拼图（+10 只能真拼）、`form=ML2W4J/ML2Y2H` 应用内搜索卡、等级不足卡，命中即跳过并计入「需人工」，不再反复重试污染失败计数
- ✅ 新增**通知分层节流**：同一异常 key 6 小时内只推一次，全局每小时最多 3 条，超限只写日志；日报/完成通知不受影响
- ✅ 日报新增「🗓️ 周任务 x/y」与「需人工 N」两项
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
