# 微软积分（持续修复版·优化）

脚本猫（ScriptCat）用户脚本 —— 自动完成 Microsoft Rewards 每日任务，并通过浏览器通知 / 微信（PushPlus）推送进度与日报。

> 版本：v1.6.0 · License：MIT
> 基于开源原版「微软积分（持续修复版）」迭代，本仓库版本已重构推送模块，并适配 2026-11 新版站点（纯服务端渲染 + 懒加载 Server Action）。

---

## ✨ 功能特性

- **签到**：PC 端 + APP 端双通道每日签到，失败自动补签
- **阅读**：新闻阅读任务，动态解析 Server Action 上报
- **搜索**：真实热词池搜索 + 随机间隔，模拟真人行为；配额取 DAPI 搜索任务与 dashboard 服务端数据
- **任务**：每日任务集、活动卡片、待领取积分（Server Action 自动领取）、连续签到奖励自动领取
- **推送**：半程进度提醒、每日日报、异常提醒
- **调度**：crontab 每 20 分钟后台运行；运行锁防并发；连续 3 天全部完成后次日自动跳过
- **调试**：Token 状态、调试日志环形缓冲、诊断数据一键导出

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

- **最新版直链**：[microsoft-rewards-scriptcat.user.js](https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-scriptcat.user.js)
- 历史版本：[Releases 页面](https://github.com/vfuncyy/scriptcat-ms-rewards/releases)

> 脚本头部已声明 `@updateURL` / `@downloadURL`（始终指向最新 Release 资产）：在脚本猫中开启「检查更新」即可自动升级到最新版。

## 📦 安装使用

1. 浏览器安装 [脚本猫 ScriptCat](https://scriptcat.org/) 扩展（Chrome / Edge / Firefox）；
2. 将 `微软积分（持续修复版·优化）.user.js` 导入脚本猫（拖入扩展或新建脚本粘贴全文）；
3. 首次使用：脚本菜单 →「🔑 手动授权」→ 登录微软账户完成 OAuth 授权；
4. 之后由 crontab（`*/20 * * * *`）自动运行，无需人工干预；
5. 自动更新：脚本已内置 `@updateURL`/`@downloadURL`，在脚本猫中开启「检查更新」后，新发布的 Release 会自动拉取升级（随附的 `script.options.json` 已默认开启）。

## ⚙️ 配置说明

设置面板分三组：

- `Config`：常驻后台、运行锁、搜索间隔、授权码接口等
- `Tasks`：签到 / 阅读 / 活动卡 / 问答 / 搜索 五项任务开关
- `Notice`：浏览器通知开关、PushPlus 开关、PushPlus Token

常用菜单：🔑 手动授权 · ⚡ 兑换面板授权码 · 📊 Token 状态 · 🚀 立即运行 · 🔔 配置 PushPlus 推送 · 📢 测试通知 · 🔧 调试信息 · 🧪 导出诊断数据

## 🧩 工作原理（模块速览）

| 模块 | 职责 |
| --- | --- |
| 元数据头 | `@connect` 声明微软业务域、热词接口域与 pushplus.plus；`@match` 覆盖 OAuth 回调页与 Bing/Rewards 页面 |
| UserConfig | 设置面板三组配置，与菜单读写同一批存储键 |
| 登录回调捕获 | 在 `oauth20_desktop.srf` 截获 OAuth code，兑换并续期 access token |
| RewardsAuto | UA / offerId / 搜索词池 / 跳过规则等常量与运行状态（含兜底的领取 action id） |
| PushPlus | 推送配置读取与就绪判定（endpoint、token、开关） |
| Utils | 缓存（TTL+单飞）、安全 UI 封装、三通道 `log()`、通知状态按日去重、`sendPushPlus()`、带退避重试的 `xhr()` |
| API 层 | token 生命周期、**dashboard 服务端渲染解析**（余额/等级/连签/待领取）、DAPI 511 字段适配、阅读与卡片（Server Action 动态解析）、搜索（热词 + 配额）、区域检查 |
| 自动领取 | 两跳定位懒加载 chunk 里的 `reportClaimAllPoints` action id → `POST /dashboard`（`Next-Action` 头 + `[]`）→ 余额复核 |
| TaskManager | 运行锁、完成调度、七项任务执行、报表汇总、收尾推送 |
| 菜单系统 | 授权 / 兑换 / 状态 / 立即运行 / 推送配置 / 测试通知 / 调试导出 |
| init | crontab 注册；Bing 搜索页跳过初始化；登录回调页立即兑换 token |

## 🗂️ 文件结构

```
scriptcat-ms-rewards/
├── 微软积分（持续修复版·优化）.user.js   # 主脚本（直接导入脚本猫）
├── script.options.json                 # 脚本猫选项元数据（含 @connect 声明）
├── script.storage.json                 # 存储快照示例（令牌已脱敏置空）
├── 主页实测与改进清单.md                # 2026-11 新版站点实测证据与 16 项改进清单
└── README.md
```

## 🔐 安全说明

- 微软登录凭据（access token）仅保存在本机脚本猫存储中，**不会**出现在本仓库；
- 仓库内 `script.storage.json` 为结构示例，真实令牌字段已置空；
- PushPlus token 请自行注册获取，勿使用他人 token。

## 🔧 改动记录

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

## ⚠️ 免责声明

本项目仅供学习与研究。使用本脚本产生的一切风险与后果由使用者自行承担；请遵守 Microsoft 服务条款及所在地区法律法规；不得用于商业用途。MIT License。
