// ==UserScript==
// @name         微软bing rewards积分获取（持续优化版）
// @namespace    https://rewards.bing.com/
// @version      2.0.0
// @description  每天后台自动完成 Microsoft Rewards 任务（PC/APP 签到、新闻阅读、活动卡片、任务卡、PC 搜索、待领取积分），并按服务端真实数据推送「半程进度 / 每日日报 / 异常提醒」到浏览器通知与微信（PushPlus）；v2.0 全新暗色控制台面板，把运行状态、调试信息、诊断数据统一成可视化界面；每天固定运行，不会因为昨天已完成而跳过；全程后台运行，不打开多余标签页
// @icon         https://bing.com/th?id=OMR.icon-96.png&pid=Rewards
// @license      MIT
// @crontab      */20 * * * *
// @connect      bing.com
// @connect      login.live.com
// @connect      rewards.bing.com
// @connect      prod.rewardsplatform.microsoft.com
// @connect      hotapi.nntool.cc
// @connect      hot.baiwumm.com
// @connect      cnxiaobai.com
// @connect      disp-qryapi.3g.qq.com
// @connect      pushplus.plus
// @match        https://login.live.com/oauth20_desktop.srf*
// @match        https://rewards.bing.com/*
// @match        https://www.bing.com/*
// @match        https://cn.bing.com/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_cookie
// @grant        GM_info
// @grant        GM_log
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @storageName  BingRewardsAuto_Shared
// @homepageURL  https://github.com/vfuncyy/scriptcat-ms-rewards
// @supportURL   https://github.com/vfuncyy/scriptcat-ms-rewards/issues
// @updateURL    https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-scriptcat.user.js
// @downloadURL  https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-scriptcat.user.js
// @tips         此脚本为开源免费使用，请勿购买
// @tag          微软积分
// @tag          每日签到
// @tag          自动任务
// @tag          PushPlus
// ==/UserScript==

/*
 * 开源致谢 / Acknowledgments
 * 本脚本是在下列开源作品的基础上持续修复与重构而来，感谢原作者与维护者：
 *   1. yehai《微软积分（持续修复版）》        https://gitee.com/yehai/bing-rewards        （本脚本的直接上游）
 *   2. hidmould《微软积分（优化版）》          https://github.com/hidmould/MicrosoftPoints  （CDP 真搜索、Quiz/拼图判定、通知分层的实测结论来源）
 *   3. Muverix《Get Microsoft Rewards (修复/增强版)》 https://github.com/Muverix/Get-Microsoft-Rewards （等级门槛/待领取判定的思路来源）
 *   4. QingJ《Get Microsoft Rewards》          https://github.com/QingJ01                   （上述同类脚本的共同起点，本脚本的谱系源头）
 * 感谢 ScriptCat（脚本猫）提供的运行环境与分发平台：https://scriptcat.org
 * 本项目同样以 MIT 协议开源，详见仓库 README。
 */

/* global GM_cookie, GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_log, GM_info, GM_notification, GM_openInTab */

/* ==UserConfig==
Config:
    keep:
        title: 持续检测（全部完成后是否继续）
        type: checkbox
        default: true
    lock:
        title: 锁定国区（非大陆IP自动停止）
        type: checkbox
        default: true
    span:
        title: 搜索间隔（秒）
        type: number
        default: 30
        min: 30
        unit: ±15秒
    api:
        title: 搜索词接口（offline为随机搜索词）
        type: select
        default: offline
        values: [offline, hot.nntool.cc, hot.baiwumm.com, hot.cnxiaobai.com]
    code:
        title: 授权码链接
        type: textarea
        description: 粘贴 login.live.com 跳转后的完整URL；保存后会立即兑换 Token（兑换失败请用菜单「📋 粘贴授权码」重试）
Tasks:
    sign:
        title: 每日签入
        type: checkbox
        default: true
    read:
        title: 新闻阅读
        type: checkbox
        default: true
    promos:
        title: 活动卡片（含打卡）
        type: checkbox
        default: true
    quiz:
        title: Quiz 自动答题
        type: checkbox
        default: true
    search:
        title: PC搜索
        type: checkbox
        default: true
Notice:
    bro:
        title: 浏览器通知（当前脚本）
        type: checkbox
        default: true
    pushplus:
        title: PushPlus 微信推送
        type: checkbox
        default: true
    pushplusToken:
        title: PushPlus Token
        type: text
        password: true
        description: 微信扫码登录 pushplus.plus 后，首页即可获取自己的 token；留空则只用浏览器通知。目标域名已在 @connect 声明为 pushplus.plus
==/UserConfig== */

(function() {
    'use strict';

    const isLoginCallback = typeof location !== "undefined"
        && location.hostname === "login.live.com"
        && location.pathname === "/oauth20_desktop.srf";
    if (isLoginCallback) {
        const code = new URLSearchParams(location.search).get("code");
        if (code) {
            // 只保存授权码，不立即关页：脚本末尾会在本页立即兑换 token，
            // 避免等下一轮定时（最长 20 分钟）导致一次性授权码过期
            GM_setValue("Config.code", location.href);
            // 暂存旧 refresh_token：新码兑换失败时可回退，避免把唯一凭据清掉
            GM_setValue("Config.tokenBackup", GM_getValue("Config.token", false));
            GM_setValue("Config.token", false);
            if (GM_getValue("Notice.bro", true)) {
                try { GM_notification({ title: "🟢 授权成功", text: "授权码已捕获，正在换取 Token，请稍候" }); } catch(_) {}
            }
        }
    }

    const RewardsAuto = {
        ua: {
            pc: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
            mobile: "Mozilla/5.0 (Linux; Android 16; Redmi K20 Pro Build/BP4A.251205.006; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Mobile Safari/537.36 EdgA/131.0.0.0",
            app: "Mozilla/5.0 (Linux; Android 16; Redmi K20 Pro Build/BP4A.251205.006; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Mobile Safari/537.36 BingSapphire/32.6.2110003560",
        },
        appConfig: {
            rewardsAppId: "SAAndroid/32.6.2110003560",
            channel: "SAAndroid",
            offerIds: {
                dailyCheckIn: "Gamification_Sapphire_DailyCheckIn",
                readArticle: "ENUS_readarticle3_30points",
            },
            // 「可领取积分」的 Server Action ID（2026-11 实测值）。
            // 站点每次部署都会换 ID，运行时优先从懒加载 chunk 动态解析，这里只作兜底。
            claimActionId: "00491296f1d668ad46b65342c95cb9d72a62c1fa9d"
        },
        searchPool: [
            "what is the weather forecast tomorrow",
            "how do I make sourdough bread at home",
            "where can I find cheap flights to tokyo",
            "why is the sky blue scientific explanation",
            "how to learn rust programming in 2026",
            "what time does the world cup final start",
            "how to fix a leaky kitchen faucet step by step",
            "what are the best vr games of 2026",
            "how to start a vegetable garden in spring",
            "where to watch new movies this week",
            "how to take care of a bonsai tree",
            "what is the difference between python async and threading",
            "how to meditate properly for beginners",
            "what is the origin of halloween traditions",
            "how do solar panels actually work",
            "what is the best mechanical keyboard for typing",
            "how to tie a windsor knot tie",
            "what causes northern lights aurora borealis",
            "how to brew the perfect espresso at home",
            "what are the symptoms of vitamin d deficiency",
            "how to sleep better naturally tonight",
            "why do cats purr when they are happy",
            "best coffee shops in san francisco downtown",
            "italian restaurants near times square",
            "tokyo cherry blossom season 2026 forecast",
            "rtx 5070 ti benchmark vs rtx 4080 super",
            "iphone 17 release date and features",
            "tesla stock price today nasdaq",
            "best noise cancelling headphones under 300",
            "fastest electric cars 0 to 60 mph",
            "vintage camera brands collectors guide",
            "budget gaming laptop with rtx 4070 2026",
            "easy chocolate chip cookies recipe from scratch",
            "30 minute home workout routine no equipment",
            "stretching exercises for lower back pain relief",
            "easy origami crane folding instructions",
            "git rebase vs merge which one to use",
            "markdown cheat sheet with examples",
            "japanese hiragana chart pronunciation",
            "ancient rome history quick overview",
            "pomodoro technique for focus and productivity",
            "healthy breakfast ideas under 10 minutes",
            "天气预报", "今日新闻热点", "美食食谱家常菜", "旅游攻略", "健康养生知识",
            "科技资讯", "电影推荐", "股票行情", "体育赛事", "历史上的今天"
        ],
        apiConfig: {
            mode: GM_getValue("Config.api", "offline"),
            arr: [
                ["hot.baiwumm.com", {
                    url: "https://hot.baiwumm.com/api/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq", "netease", "zhihu"],
                }],
                ["hot.cnxiaobai.com", {
                    url: "https://cnxiaobai.com/DailyHotApi/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
                ["hot.nntool.cc", {
                    url: "https://hotapi.nntool.cc/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
            ],
            url: "",
            hot: [],
            wordList: [],
            wordIndex: 0,
        },
        /** 卡片类型中文标签：内部代号（open_only 等）对用户不可读，日志统一用该映射展示 */
        kindText: {
            image_creator: "图片创作",
            explore_search: "探索搜索",
            daily: "每日任务",
            streak: "连续打卡",
            open_only: "内容访问"
        },
        skipPatterns: [
            "referral", "refer and earn", "sweepstake", "entries",
            "install the", "set bing as your default", "bing wallpaper",
            "punch card", "ancient coin", "sea of thieves", "rewards extension",
            "redemption goal", "order history", "claim your gift", "shop to earn",
            "set goal", "Available tomorrow", "Offer is Locked", "Earn -1 points",
            /* "拼图", "quiz" allowed */
        ],
        skipHrefs: [
            "sweepstakes/", "referandearn", "aka.ms/win", "workinprogress",
            "punchcard", "microsoft-store", "goal/all", "orderhistory",
            "/redeem", "/redeemgoal", "xbox.com/rewards"
        ],
        state: {
            token: false,
            region: "CN",
            host: "www.bing.com",
            dateNowNum: 0,
            dateNowStr: "",
            pcProgress: 0,
            pcMax: 90,
            readProgress: 0,
            readMax: 30,
            sendMSG: "",
            lastSearchProgress: -1,
            restrictedTimes: 0,
            ip: "",
            ipInfo: "",
            startTime: 0,
            precheck: null,
        },
        /**
         * 调试信息环形缓冲：默认只存内存，供菜单「调试信息」查看
         * @type {Array<{t:number, tag:string, msg:string}>}
         */
        debugBuffer: [],
        /** 本轮已确认完成的 offerId，避免重复上报同一卡片 */
        claimedOfferIds: new Set(),
        /** 上报已受理但 dashboard 尚未确认的卡片，避免提前标记当天完成 */
        unconfirmedOfferIds: new Set(),
        /**
         * 本轮判定为「脚本做不了、需要人工」的卡片：offerId → { title, reason }
         * v1.8.0 新增，日报里汇总条数，避免把这类卡当成“失败”反复重试
         */
        humanNeeded: new Map()
    };

    /**
     * PushPlus（pushplus.plus）微信推送配置
     *
     * 说明：PushPlus 是“填一个 token 就能往微信推”的公有服务。
     * 微信扫码登录 pushplus.plus 后，首页即可看到自己的 token。
     * 推送接口：POST https://www.pushplus.plus/send，JSON body：
     *   { token, title, content, template: "txt" }
     * 返回 { code: 200, msg, data }，code=200 表示请求受理（异步送达微信）。
     *
     * 未填 token 时退化为只用浏览器通知，不产生任何外部请求。
     */
    const PushPlus = {
        /** 推送端点（域名已在 @connect 声明） */
        endpoint: "https://www.pushplus.plus/send",

        /**
         * 读取当前生效的推送配置（每次发送都重读，菜单/面板改完无需重载脚本）
         * @returns {{enabled:boolean, token:string}} 配置
         */
        read() {
            return {
                enabled: GM_getValue("Notice.pushplus", true) !== false,
                token: String(GM_getValue("Notice.pushplusToken", "") || "").trim()
            };
        },

        /**
         * 是否具备推送条件：开关打开且已填 token
         * @returns {boolean}
         */
        ready() {
            const cfg = this.read();
            return Boolean(cfg.enabled && cfg.token);
        }
    };

    const Utils = {
        /** 进程内缓存：key -> {value, exp} */
        _cache: new Map(),
        /** 单飞：同一 key 的并发请求只执行一次 */
        _inflight: new Map(),

        /**
         * 带 TTL 与单飞的内存缓存
         * @param {string} key 缓存键
         * @param {number} ttl 有效期（毫秒）
         * @param {Function} loader 实际加载函数
         * @returns {Promise<*>} 缓存值或加载结果
         */
        async cached(key, ttl, loader) {
            const hit = this._cache.get(key);
            if (hit && hit.exp > Date.now()) return hit.value;
            if (this._inflight.has(key)) return this._inflight.get(key);
            const pending = (async () => {
                try {
                    const value = await loader();
                    this._cache.set(key, { value, exp: Date.now() + ttl });
                    return value;
                } finally {
                    this._inflight.delete(key);
                }
            })();
            this._inflight.set(key, pending);
            return pending;
        },
        cacheSet(key, value, ttl) {
            this._cache.set(key, { value, exp: Date.now() + ttl });
        },
        cacheDelete(key) {
            this._cache.delete(key);
        },
        cacheClear(prefix = "") {
            for (const key of [...this._cache.keys()]) {
                if (!prefix || key.startsWith(prefix)) this._cache.delete(key);
            }
            for (const key of [...this._inflight.keys()]) {
                if (!prefix || key.startsWith(prefix)) this._inflight.delete(key);
            }
        },

        /** 后台上下文没有 alert/prompt/confirm，统一降级避免菜单命令抛错 */
        safeAlert(message) {
            try {
                if (typeof alert === "function") { alert(String(message)); return; }
            } catch (_) {}
            try { GM_notification({ title: GM_info.script.name, text: String(message) }); } catch (_) {}
        },
        safePrompt(message, defaultValue = "") {
            try {
                if (typeof prompt === "function") return prompt(String(message), defaultValue);
            } catch (_) {}
            this.safeAlert(`后台环境不支持输入框，请在脚本猫设置页修改配置。\n${message}`);
            return null;
        },
        safeConfirm(message) {
            try { if (typeof confirm === "function") return confirm(String(message)); } catch (_) {}
            return false;
        },
        safeReload() {
            try {
                if (typeof location !== "undefined" && typeof location.reload === "function") location.reload();
            } catch (_) {}
        },

        log(icon, msg, push = false) {
            GM_log(`${icon} ${msg}`);
            if (push && GM_getValue("Notice.bro", true)) {
                try {
                    GM_notification({
                        title: GM_info.script.name + ` ${icon}`,
                        text: msg,
                        onclick: () => GM_openInTab("https://rewards.bing.com/dashboard", { active: true })
                    });
                } catch(_) {}
            }
            if (push) {
                RewardsAuto.state.sendMSG = `${icon} ${msg}`;
                this.sendPushPlus();
            }
        },

        /**
         * 记录调试信息：默认只写入内存环形缓冲，不输出到用户日志
         * 需要实时查看时可在脚本菜单中开启「调试日志」
         * @param {string} tag 分类标签（如 sign-pc、search-report）
         * @param {*} msg 调试内容
         */
        debug(tag, msg) {
            const entry = {
                t: Date.now(),
                tag: String(tag || "debug"),
                msg: String(msg === undefined || msg === null ? "" : msg).slice(0, 4000)
            };
            const buffer = RewardsAuto.debugBuffer;
            buffer.push(entry);
            if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
            if (GM_getValue("Config.debugLog", false)) {
                GM_log(`🔧 [${entry.tag}] ${entry.msg}`);
            }
        },

        /**
         * 复制文本到剪贴板：后台上下文优先用 GM_setClipboard，页面上下文回退到 DOM
         * @param {string} text 待复制文本
         * @returns {boolean} 是否复制成功
         */
        copyText(text) {
            try {
                if (typeof GM_setClipboard === "function") {
                    GM_setClipboard(text, "text");
                    return true;
                }
            } catch (_) {}
            if (typeof document === "undefined") return false;
            try {
                const helper = document.createElement("textarea");
                helper.value = text;
                helper.style.cssText = "position:fixed;left:-9999px;top:0;";
                (document.body || document.documentElement).appendChild(helper);
                helper.focus();
                helper.select();
                const ok = document.execCommand("copy");
                helper.remove();
                return ok;
            } catch (_) {
                return false;
            }
        },

        /**
         * 面板样式表：整表作用于 Shadow DOM，杜绝宿主页样式污染；
         * 颜色取设计系统三段式 token（primitive → semantic → component）的取值。
         * @returns {string} CSS 文本
         */
        panelCss() {
            return `
:host{--pc-bg:#0F172A;--pc-surface:#1E293B;--pc-surface-2:#334155;--pc-fg:#F8FAFC;--pc-muted:#94A3B8;--pc-border:#475569;--pc-accent:#22C55E;--pc-danger:#EF4444;--pc-warn:#FBBF24;--pc-ring:#22C55E;--pc-sans:ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei",sans-serif;--pc-mono:ui-monospace,"Cascadia Code",Consolas,monospace;}
*{box-sizing:border-box;}
.wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.62);font:13px/1.5 var(--pc-sans);color:var(--pc-fg);}
.card{width:min(680px,94vw);max-height:86vh;display:flex;flex-direction:column;background:var(--pc-surface);border:1px solid var(--pc-border);border-radius:14px;box-shadow:0 18px 48px rgba(2,6,23,.55);overflow:hidden;animation:pc-in 220ms cubic-bezier(.2,.8,.2,1);}
@keyframes pc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--pc-border);background:linear-gradient(180deg,rgba(51,65,85,.4),rgba(30,41,59,0));}
.dot{width:8px;height:8px;border-radius:999px;background:var(--pc-accent);box-shadow:0 0 0 3px rgba(34,197,94,.16);flex:0 0 auto;}
.title{font-weight:600;font-size:15px;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.meta{margin-left:auto;font:11px/1.4 var(--pc-mono);color:var(--pc-muted);white-space:nowrap;}
.x{width:24px;height:24px;padding:0;display:grid;place-items:center;font-size:14px;line-height:1;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--pc-muted);cursor:pointer;}
.x:hover{background:var(--pc-surface-2);color:var(--pc-fg);}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--pc-border);}
.stat{padding:10px 12px;border-left:1px solid var(--pc-border);min-width:0;}
.stat:first-child{border-left:0;}
.stat .k{font-size:11px;color:var(--pc-muted);letter-spacing:.02em;white-space:nowrap;}
.stat .v{font:600 15px/1.3 var(--pc-mono);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.stat .v small{font-weight:400;font-size:11px;color:var(--pc-muted);margin-left:2px;}
.body{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#3d4b61 transparent;}
.body::-webkit-scrollbar,.log::-webkit-scrollbar,.rawbox textarea::-webkit-scrollbar{width:10px;height:10px;}
.body::-webkit-scrollbar-track,.log::-webkit-scrollbar-track{background:transparent;}
.body::-webkit-scrollbar-thumb,.log::-webkit-scrollbar-thumb,.rawbox textarea::-webkit-scrollbar-thumb{background:#3d4b61;border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.body::-webkit-scrollbar-thumb:hover,.log::-webkit-scrollbar-thumb:hover,.rawbox textarea::-webkit-scrollbar-thumb:hover{background:#4b5a72;background-clip:content-box;}
.sec{display:flex;align-items:baseline;gap:8px;padding:10px 14px 2px;}
.sec .h{font-size:11px;letter-spacing:.06em;color:var(--pc-muted);}
.sec .n{margin-left:auto;font:11px/1 var(--pc-mono);color:var(--pc-muted);}
.rows{list-style:none;margin:0;padding:0 8px 8px;}
.row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 6px;border-radius:6px;transition:background 150ms ease;}
.row:hover{background:rgba(51,65,85,.45);}
.row .ic{width:18px;height:18px;display:grid;place-items:center;font-size:11px;line-height:1;border-radius:999px;box-shadow:inset 0 0 0 1px currentColor;color:var(--pc-muted);}
.row .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.row .st{font:11px/1 var(--pc-mono);color:var(--pc-muted);white-space:nowrap;}
.row.is-ok .ic,.row.is-ok .st{color:var(--pc-accent);}
.row.is-run .ic{color:var(--pc-warn);}
.row.is-run .st{color:var(--pc-fg);}
.row.is-fail .ic,.row.is-fail .st{color:var(--pc-danger);}
.row.is-wait{opacity:.78;}
.row.is-skip{opacity:.6;}
.log{margin:0 14px 10px;padding:9px 11px;max-height:26vh;overflow:auto;font:11px/1.65 var(--pc-mono);color:var(--pc-muted);background:rgba(2,6,23,.42);border:1px solid var(--pc-border);border-radius:6px;white-space:pre-wrap;word-break:break-word;}
.log:empty{display:none;}
.rawbox{padding:0 14px 10px;}
.rawbox>summary{cursor:pointer;font-size:12px;color:var(--pc-muted);padding:6px 0;user-select:none;list-style:none;}
.rawbox>summary::-webkit-details-marker{display:none;}
.rawbox>summary:hover{color:var(--pc-fg);}
.rawbox>summary::before{content:"▸ ";color:var(--pc-muted);}
.rawbox[open]>summary::before{content:"▾ ";}
textarea{width:100%;height:32vh;resize:vertical;font:12px/1.6 var(--pc-mono);color:var(--pc-fg);background:rgba(2,6,23,.55);border:1px solid var(--pc-border);border-radius:6px;padding:8px;white-space:pre;tab-size:2;}
.note{margin:10px 14px 0;padding:6px 9px;font-size:12px;color:var(--pc-fg);background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.28);border-radius:6px;word-break:break-word;}
.ft{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--pc-border);background:rgba(15,23,42,.6);}
button{font:inherit;font-size:13px;padding:7px 13px;border-radius:6px;border:1px solid var(--pc-border);background:var(--pc-surface-2);color:var(--pc-fg);cursor:pointer;transition:background 150ms ease,border-color 150ms ease,transform 80ms ease;white-space:nowrap;}
button:hover{background:#3d4b61;}
button:active{transform:translateY(1px);}
button.primary{background:var(--pc-accent);border-color:var(--pc-accent);color:#0F172A;font-weight:600;}
button.primary:hover{background:#2ee06a;border-color:#2ee06a;}
button:focus-visible,.rawbox>summary:focus-visible,textarea:focus-visible{outline:2px solid var(--pc-ring);outline-offset:2px;}
.hint{margin-left:auto;font:11px/1.4 var(--pc-mono);color:var(--pc-muted);white-space:nowrap;}
@media (prefers-reduced-motion:reduce){.card{animation:none;}button{transition:none;}}
@media (max-width:420px){.card{width:100%;max-height:92vh;}.stats{grid-template-columns:repeat(2,1fr);}.stat:nth-child(3){border-left:0;}.hint{display:none;}}
`;
        },

        /**
         * 由服务端统计生成面板指标条与任务行（调试面板与「运行状态」菜单共用）
         * @param {Object} stats API.getServerStats() 结果，可为 null
         * @param {Object} [extra] 附加信息：{ tokenReady, claimable }
         * @returns {{stats:Array<Object>,rows:Array<Object>}} 面板模型
         */
        buildPanelModel(stats, extra = {}) {
            const s = stats || {};
            const rows = [];
            /**
             * 追加一行任务状态
             * @param {string} name 任务名
             * @param {string} status ok|run|wait|skip|fail
             * @param {string} note 右侧说明
             */
            const add = (name, status, note) => rows.push({ name, status, note: note || "" });
            const known = (item) => Boolean(item && item.known);
            const done = (item) => Boolean(item && item.done);
            const filled = (item) => Boolean(item && item.known && item.max > 0 && item.progress >= item.max);
            const fmt = (item) => {
                if (!known(item)) return "—";
                if (item.total !== undefined) return `${item.done}/${item.total}`;
                return `${item.progress}/${item.max}`;
            };
            /**
             * 百分比型任务转状态
             * @param {Object} item 进度项
             * @returns {string} 状态
             */
            const statusOf = (item) => {
                if (!known(item)) return "wait";
                if (filled(item)) return "ok";
                return item.progress > 0 ? "run" : "wait";
            };
            const tokenReady = extra.tokenReady === undefined ? Boolean(RewardsAuto.state.token) : Boolean(extra.tokenReady);
            add("授权 Token", tokenReady ? "ok" : "fail", tokenReady ? "已就绪" : "未获取，需重新授权");
            add("PC 签到", done(s.signPC) ? "ok" : "wait", done(s.signPC) ? "已完成" : (known(s.signPC) ? "待完成" : "—"));
            add("App 签到", done(s.signApp) ? "ok" : "wait", done(s.signApp) ? "已完成" : (known(s.signApp) ? "待完成" : "—"));
            add("PC 搜索", statusOf(s.search), fmt(s.search));
            add("新闻阅读", statusOf(s.read), fmt(s.read));
            add("日常任务", statusOf(s.dailySet), fmt(s.dailySet));
            add("任务卡", statusOf(s.punchcard), fmt(s.punchcard));
            add("活动卡片", statusOf(s.evergreen), fmt(s.evergreen));
            if (s.appBonus && s.appBonus.known && s.appBonus.total > 0) {
                add("App 专属奖励", statusOf(s.appBonus), fmt(s.appBonus));
            }
            const claimable = extra.claimable === undefined ? (s.claimable || 0) : extra.claimable;
            add("待领取积分", claimable > 0 ? "run" : "ok", claimable > 0 ? `+${claimable}` : "无");
            const okCount = rows.filter(r => r.status === "ok").length;
            const streak = s.checkin && s.checkin.known ? s.checkin.streak : null;
            const hasStreak = streak !== null && streak !== undefined;
            return {
                stats: [
                    { label: "今日得分", value: s.earnedToday === null || s.earnedToday === undefined ? "—" : `+${s.earnedToday}` },
                    { label: "任务完成", value: `${okCount}/${rows.length}` },
                    { label: "账户余额", value: s.balance === null || s.balance === undefined ? "—" : Number(s.balance).toLocaleString("zh-CN") },
                    { label: "连续签到", value: hasStreak ? String(streak) : "—", unit: hasStreak ? "天" : undefined }
                ],
                rows
            };
        },

        /**
         * 在页面中展示控制面板（后台 service worker 无 DOM 时返回 null）
         * @param {Object} [opts] 面板配置
         * @param {string} [opts.title] 标题
         * @param {string} [opts.meta] 标题右侧元信息
         * @param {string} [opts.note] 顶部提示条（如复制结果）
         * @param {Array<{label:string,value:string,unit?:string}>} [opts.stats] 指标条
         * @param {Array<{name:string,status:string,note?:string}>} [opts.rows] 任务行
         * @param {string} [opts.rowsTitle] 任务行分区标题
         * @param {Array<string>|string} [opts.log] 日志行
         * @param {string} [opts.logTitle] 日志分区标题
         * @param {string} [opts.text] 原始文本（折叠区展示且可复制）
         * @param {string} [opts.textTitle] 原始文本折叠标题
         * @param {Array<{label:string,primary?:boolean,onClick:Function}>} [opts.actions] 底部按钮
         * @param {string} [opts.hint] 底部右侧提示
         * @returns {{setText:Function,setRows:Function,setStats:Function,appendLog:Function,close:Function}|null} 面板控制句柄
         */
        showPanel(opts = {}) {
            if (typeof document === "undefined") return null;
            const host = document.body || document.documentElement;
            if (!host) return null;
            const hostEl = document.createElement("div");
            hostEl.setAttribute("data-msrewards-panel", "1");
            hostEl.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
            const root = hostEl.attachShadow ? hostEl.attachShadow({ mode: "open" }) : hostEl;
            const css = Utils.panelCss();
            try {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(css);
                root.adoptedStyleSheets = [sheet];
            } catch (_) {
                const styleEl = document.createElement("style");
                styleEl.textContent = css;
                root.appendChild(styleEl);
            }
            /**
             * 创建元素并挂类名
             * @param {string} tag 标签名
             * @param {string} [cls] 类名
             * @returns {HTMLElement} 元素
             */
            const el = (tag, cls) => {
                const node = document.createElement(tag);
                if (cls) node.className = cls;
                return node;
            };
            const wrap = el("div", "wrap");
            const card = el("div", "card");
            card.setAttribute("role", "dialog");
            card.setAttribute("aria-modal", "true");
            card.setAttribute("aria-label", opts.title || "面板");
            const hd = el("div", "hd");
            hd.append(el("span", "dot"));
            const titleEl = el("h2", "title");
            titleEl.textContent = opts.title || "";
            hd.append(titleEl);
            if (opts.meta) {
                const metaEl = el("span", "meta");
                metaEl.textContent = opts.meta;
                hd.append(metaEl);
            }
            const closeBtn = el("button", "x");
            closeBtn.type = "button";
            closeBtn.textContent = "✕";
            closeBtn.setAttribute("aria-label", "关闭");
            hd.append(closeBtn);
            const body = el("div", "body");
            const statsEl = el("div", "stats");
            const noteEl = el("div", "note");
            if (opts.note) {
                noteEl.textContent = opts.note;
                card.append(hd, noteEl, body);
            } else {
                noteEl.style.display = "none";
                card.append(hd, body);
            }
            // 指标条
            if (Array.isArray(opts.stats) && opts.stats.length) {
                opts.stats.forEach((item) => {
                    const box = el("div", "stat");
                    const k = el("div", "k");
                    k.textContent = item.label;
                    const v = el("div", "v");
                    v.textContent = item.value;
                    if (item.unit) {
                        const u = el("small");
                        u.textContent = item.unit;
                        v.append(u);
                    }
                    box.append(k, v);
                    statsEl.append(box);
                });
                // 指标条挂在滚动区之外：滚动任务行时数值始终可见
                if (card.contains(body) && !statsEl.isConnected) card.insertBefore(statsEl, body);
            }
            // 任务行
            const rowsWrap = el("div");
            const rowsSec = el("div", "sec");
            const rowsTitle = el("span", "h");
            rowsTitle.textContent = opts.rowsTitle || "任务队列";
            const rowsCount = el("span", "n");
            rowsSec.append(rowsTitle, rowsCount);
            const rowsList = el("ul", "rows");
            rowsWrap.append(rowsSec, rowsList);
            /**
             * 渲染任务行
             * @param {Array<Object>} rows 任务行数据
             */
            const renderRows = (rows) => {
                rowsList.textContent = "";
                const list = Array.isArray(rows) ? rows : [];
                const glyph = { ok: "✓", run: "◐", wait: "·", skip: "–", fail: "!" };
                list.forEach((row) => {
                    const li = el("li", `row is-${row.status || "wait"}`);
                    const ic = el("span", "ic");
                    ic.textContent = glyph[row.status] || glyph.wait;
                    ic.setAttribute("aria-hidden", "true");
                    const nm = el("span", "nm");
                    nm.textContent = row.name || "";
                    nm.title = row.name || "";
                    const st = el("span", "st");
                    st.textContent = row.note || "";
                    li.append(ic, nm, st);
                    rowsList.append(li);
                });
                const okCount = list.filter(r => r.status === "ok").length;
                rowsCount.textContent = `${okCount} / ${list.length}`;
                // 只在首次渲染时挂载到 body 顶部；重复 setRows 不再移动节点
                if (list.length && !rowsWrap.isConnected) {
                    body.insertBefore(rowsWrap, body.firstChild);
                }
                if (!list.length) rowsWrap.remove();
            };
            if (Array.isArray(opts.rows)) renderRows(opts.rows);
            else rowsWrap.remove();
            // 日志
            const logEl = el("pre", "log");
            /**
             * 渲染日志文本
             * @param {Array<string>|string} log 日志
             */
            const renderLog = (log) => {
                const lines = Array.isArray(log) ? log : String(log || "").split("\n");
                logEl.textContent = lines.filter(Boolean).join("\n");
            };
            if (opts.log) {
                const logSec = el("div", "sec");
                const logTitle = el("span", "h");
                logTitle.textContent = opts.logTitle || "运行日志";
                logSec.append(logTitle);
                body.append(logSec, logEl);
                renderLog(opts.log);
            }
            // 原始文本（折叠）
            const area = document.createElement("textarea");
            area.readOnly = true;
            let rawBox = null;
            if (opts.text !== undefined && opts.text !== null) {
                rawBox = el("details", "rawbox");
                const summary = el("summary");
                summary.textContent = opts.textTitle || "原始文本";
                area.value = String(opts.text);
                rawBox.append(summary, area);
                body.append(rawBox);
            }
            // 底栏
            const ft = el("div", "ft");
            const actions = Array.isArray(opts.actions) ? opts.actions : [];
            actions.forEach((action) => {
                const btn = el("button", action.primary ? "primary" : "");
                btn.type = "button";
                btn.textContent = action.label;
                btn.onclick = () => { if (action.onClick) action.onClick(area, close); else close(); };
                ft.append(btn);
            });
            const hint = el("span", "hint");
            hint.textContent = opts.hint || "Esc 关闭";
            ft.append(hint);
            card.append(ft);
            wrap.append(card);
            root.appendChild(wrap);
            /**
             * 关闭并清理面板
             */
            const close = () => {
                try { document.removeEventListener("keydown", onKey, true); } catch (_) {}
                try { hostEl.remove(); } catch (_) {}
            };
            /**
             * Esc 关闭
             * @param {KeyboardEvent} ev 键盘事件
             */
            const onKey = (ev) => {
                if (ev.key === "Escape") {
                    ev.stopPropagation();
                    close();
                }
            };
            closeBtn.onclick = close;
            wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
            try { document.addEventListener("keydown", onKey, true); } catch (_) {}
            host.append(hostEl);
            return {
                setText: (next) => { area.value = String(next === undefined || next === null ? "" : next); },
                setRows: (rows) => { renderRows(rows); },
                setStats: (stats) => {
                    statsEl.textContent = "";
                    (Array.isArray(stats) ? stats : []).forEach((item) => {
                        const box = el("div", "stat");
                        const k = el("div", "k");
                        k.textContent = item.label;
                        const v = el("div", "v");
                        v.textContent = item.value;
                        if (item.unit) {
                            const u = el("small");
                            u.textContent = item.unit;
                            v.append(u);
                        }
                        box.append(k, v);
                        statsEl.append(box);
                    });
                    if (!statsEl.parentNode) body.prepend(statsEl);
                },
                appendLog: (line) => {
                    const text = logEl.textContent ? `${logEl.textContent}\n${line}` : String(line);
                    logEl.textContent = text;
                    logEl.scrollTop = logEl.scrollHeight;
                },
                close
            };
        },

        /**
         * 读取推送去重状态（按自然日重置）
         * @returns {{date:number, half:boolean, summary:boolean, errors:string[]}} 当日去重状态
         */
        getNotifyState() {
            const today = Utils.getTodayNum();
            const saved = GM_getValue("Config.notifyState", {}) || {};
            if (saved.date !== today) {
                return { date: today, half: false, summary: false, errors: [] };
            }
            return {
                date: today,
                half: Boolean(saved.half),
                summary: Boolean(saved.summary),
                errors: Array.isArray(saved.errors) ? saved.errors : []
            };
        },

        /**
         * 保存推送去重状态
         * @param {Object} state 去重状态
         */
        saveNotifyState(state) {
            GM_setValue("Config.notifyState", state);
        },

        /**
         * 标记当日的某类汇总推送已完成
         * @param {"half"|"summary"} kind 推送类型（half=半程，summary=日报）
         * @returns {boolean} true 表示本次为当日首次标记（应当推送）
         */
        markNotify(kind) {
            const state = this.getNotifyState();
            if (state[kind]) return false;
            state[kind] = true;
            this.saveNotifyState(state);
            return true;
        },

        /**
         * 推送异常信息（v1.8.0 分层节流）
         * 规则：①同一 key 6 小时内只推一次；②全局每小时最多 3 条；
         *      ③被节流时只写 GM_log，不打扰手机。完成/日报类通知不走这里，不受影响。
         * @param {string} key 错误类型标识（用于去重）
         * @param {string} msg 错误内容
         */
        notifyError(key, msg) {
            const now = Date.now();
            const state = this.getNotifyState();
            const throttle = GM_getValue("Config.notifyThrottle", null) || {};
            const keys = (throttle.keys && typeof throttle.keys === "object") ? throttle.keys : {};
            const hours = (throttle.hours && typeof throttle.hours === "object") ? throttle.hours : {};
            // 同一类异常 6 小时内只提醒一次（比「按日去重」更贴近真实扰民感受）
            const lastAt = Number(keys[key] || 0);
            if (lastAt && now - lastAt < 6 * 60 * 60 * 1000) {
                GM_log(`🔴 [同类异常 6 小时内已提醒过，静默] ${msg}`);
                return;
            }
            if (state.errors.includes(key)) {
                GM_log(`🔴 [今日已推送过该异常，静默] ${msg}`);
                return;
            }
            const bucket = String(Math.floor(now / 3600000));
            // 清理一天前的旧桶与旧 key，避免 GM 存储无限增长
            for (const k of Object.keys(hours)) {
                if (Number(k) < Number(bucket) - 24) delete hours[k];
            }
            for (const k of Object.keys(keys)) {
                if (now - Number(keys[k] || 0) > 24 * 60 * 60 * 1000) delete keys[k];
            }
            if (Number(hours[bucket] || 0) >= 3) {
                keys[key] = now;
                GM_setValue("Config.notifyThrottle", { keys, hours });
                GM_log(`🔴 [本小时推送已达 3 条上限，静默] ${msg}`);
                return;
            }
            hours[bucket] = Number(hours[bucket] || 0) + 1;
            keys[key] = now;
            GM_setValue("Config.notifyThrottle", { keys, hours });
            state.errors.push(key);
            this.saveNotifyState(state);
            this.log("🔴", `【异常】${msg}`, true);
        },

        /**
         * 推送到 PushPlus（pushplus.plus，微信）：纯文本模板，保留换行
         * 失败只写日志/调试缓冲，不中断任务流程；未配置 token 时静默跳过
         */
        async sendPushPlus() {
            const cfg = PushPlus.read();
            if (!cfg.enabled || !cfg.token) return;
            const title = GM_info.script.name;
            const text = RewardsAuto.state.sendMSG || "";
            try {
                const res = await this.xhr({
                    method: "POST",
                    url: PushPlus.endpoint,
                    headers: { "content-type": "application/json; charset=UTF-8" },
                    data: JSON.stringify({ token: cfg.token, title, content: text, template: "txt" }),
                    timeout: 10000
                });
                // PushPlus 同步响应仅代表受理：code=200 合法，实际发送结果异步
                let ok = false, msg = "";
                try {
                    const json = JSON.parse(res);
                    ok = json && Number(json.code) === 200;
                    msg = json && json.msg ? String(json.msg) : "";
                } catch (_) {
                    msg = String(res || "").slice(0, 120);
                }
                if (ok) {
                    GM_log("🔵 「PushPlus」微信推送已受理");
                    Utils.debug("push", "PushPlus 推送成功");
                } else {
                    GM_log(`🔴 「PushPlus」推送出错: ${msg}`);
                    Utils.debug("push", `PushPlus 推送失败: ${msg}`);
                }
            } catch (e) {
                GM_log(`🔴 「PushPlus」推送出错: ${e.message}`);
                Utils.debug("push", `PushPlus 推送失败: ${e.message}`);
            }
        },

        xhr(options) {
            const method = String(options.method || "GET").toUpperCase();
            const attempt = Number(options._attempt || 0);
            return new Promise((resolve, reject) => {
                const start = Date.now();
                GM_xmlhttpRequest({
                    anonymous: false,
                    ...options,
                    timeout: options.timeout || 15000,
                    onload: (res) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.responseText);
                        } else if ([301, 302, 307, 308].includes(res.status)) {
                            const match = res.responseHeaders?.match(/Location:\s*(.*?)\s*\r?\n/i);
                            resolve(match ? match[1] : false);
                        } else if (method === "GET" && attempt < 2 && (res.status === 429 || res.status >= 500)) {
                            // 仅幂等 GET 退避重试，避免重复提交任务
                            setTimeout(() => {
                                this.xhr({ ...options, _attempt: attempt + 1 }).then(resolve, reject);
                            }, 1200 * (attempt + 1));
                        } else {
                            // v1.8.5：把服务端响应体一并带出，否则 4xx/5xx 只能看到状态码，无法定位原因
                            const body = String(res.responseText == null ? "" : res.responseText);
                            const err = new Error(`HTTP ${res.status}，用时 ${cost} 秒`);
                            err.status = res.status;
                            err.body = body.slice(0, 400);
                            err.bodyLen = body.length;
                            reject(err);
                        }
                    },
                    onerror: (err) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        // v1.8.5：连接层失败原来只取 err.error（绝大多数情况就是 "Unknown Error"），
                        // 这里把整个回调对象可读化，用来区分「被 WAF 掐断」「扩展拒绝」还是「真的断网」
                        const detail = (() => {
                            try {
                                const o = err || {};
                                return JSON.stringify({
                                    error: o.error || "",
                                    status: o.status === undefined ? null : o.status,
                                    message: o.message || "",
                                    readyState: o.readyState === undefined ? null : o.readyState,
                                    bodyLen: String(o.responseText || "").length,
                                    keys: Object.keys(o)
                                }).slice(0, 300);
                            } catch (_) {
                                return "无法序列化";
                            }
                        })();
                        const e2 = new Error(`${err?.error || "网络错误"}，用时 ${cost} 秒`);
                        e2.network = true;
                        e2.detail = detail;
                        reject(e2);
                    },
                    ontimeout: () => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        reject(new Error(`请求超时，用时 ${cost} 秒`));
                    }
                });
            });
        },

        /**
         * 读取浏览器中指定 URL 的 Cookie（用于网页接口鉴权）
         * 说明：脚本运行在后台 service worker 时，GM_xmlhttpRequest 默认不携带页面会话，
         *      需通过 GM_cookie 显式读取并注入，否则 rewards.bing.com 会返回 401。
         * @param {string} url 目标地址
         * @returns {Promise<string>} Cookie 字符串（失败返回空串）
         */
        getCookieString(url) {
            // 同一次搜索会连续读取 Cookie，短缓存可显著减少 GM_cookie 调用
            return Utils.cached(`cookie:${url}`, 45_000, async () => {
                /**
                 * 按条件读取一次 Cookie 列表
                 * @param {object} detail GM_cookie 查询条件
                 * @returns {Promise<Array>} Cookie 列表
                 */
                const listOnce = (detail) => new Promise(resolve => {
                    try {
                        GM_cookie("list", detail, (cookies, err) => {
                            if (err || !Array.isArray(cookies)) return resolve([]);
                            resolve(cookies);
                        });
                    } catch (_) {
                        resolve([]);
                    }
                });
                let cookies = await listOnce({ url });
                // 未命中时按域名再读一次，覆盖 .bing.com 的共享会话 Cookie
                if (cookies.length === 0) {
                    const host = (() => { try { return new URL(url).hostname; } catch (_) { return ""; } })();
                    const domain = host.split(".").slice(-2).join(".");
                    if (domain) cookies = await listOnce({ domain: `.${domain}` });
                }
                const map = new Map();
                cookies.forEach(c => map.set(c.name, c.value));
                const str = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
                // Cookie 明细仅保存在调试缓冲区，可在菜单「🔧 诊断信息 → 1」查看
                Utils.debug("cookie", `Cookie(${url}): ${map.size ? map.size + " 项 [" + [...map.keys()].slice(0, 12).join(",") + "]" : "空"}`);
                return str;
            });
        },

        /**
         * 在真实会话 Cookie 后追加设备标记 _Rwho（用于区分桌面端 / 移动端搜索）
         * 说明：_Rwho 是 Bing 的端侧标记（u=d 桌面、u=m 移动），Rewards 的
         *      「需 App 内搜索」卡只认移动端身份发起的搜索。
         *      请求头里的 cookie 是「整体覆盖」语义：只发 _Rwho 会把 MSPAuth / MUID
         *      等登录态顶掉，服务端照样回 200，但 IsAuthenticated=false，卡片永不记账，
         *      所以必须拼在真实会话 Cookie 之后。
         * @param {string} base 浏览器真实 Cookie 串
         * @param {"d"|"m"} deviceType 设备类型，d=桌面，m=移动
         * @returns {string} 合并后的 Cookie 串
         */
        cookieWithRwho(base, deviceType) {
            const d = new Date();
            const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const rwho = `_Rwho=u=${deviceType === "m" ? "m" : "d"}&ts=${ts}`;
            const text = String(base || "");
            if (!text) return rwho;
            if (/(^|;\s*)_Rwho=/i.test(text)) {
                return text.replace(/(^|;\s*)_Rwho=[^;]*/i, (m, p1) => `${p1}${rwho}`);
            }
            return `${text}; ${rwho}`;
        },

        /**
         * 从搜索页 HTML 中提取 Bing 的 IG（本次会话的追踪 ID）
         * 说明：ncheader 与 reportActivity 必须用同一个 IG；用随机 UUID 时服务端虽然回 200，
         *      但这次搜索不会挂到当前会话上，计数不涨。
         * @param {string} html 搜索页 HTML
         * @returns {string} 大写 IG；取不到返回空串
         */
        extractIG(html) {
            const text = String(html || "");
            if (!text) return "";
            const patterns = [
                /[",]IG\s*:\s*"([0-9A-F]{16,40})"/i,
                /IG=([0-9A-F]{16,40})/i,
                /"ig"\s*:\s*"([0-9A-F]{16,40})"/i,
            ];
            for (const re of patterns) {
                const m = text.match(re);
                if (m) return String(m[1]).toUpperCase();
            }
            return "";
        },

        /**
         * 从搜索页 HTML 中提取本次 SERP 的 IID（形如 SERP.5057）
         * 说明：真实页面调 sj_rra 上报时用的是 window.data_iid，而不是硬编码的 SERP.5047；
         *      登录态下取回的搜索页 HTML 里带有 data_iid="SERP.xxxx"，必须用它。
         * @param {string} html 搜索页 HTML
         * @returns {string} IID；取不到时回退 SERP.5047
         */
        extractIID(html) {
            const text = String(html || "");
            if (text) {
                const m = text.match(/data_iid\s*=\s*["']([^"']+)["']/i);
                if (m) return m[1];
            }
            return "SERP.5047";
        },

        randomRange(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        },
        getTimestamp() { return Date.now(); },
        getTodayNum() {
            const d = new Date();
            return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`);
        },
        getTodayStr() {
            const d = new Date();
            return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
        },
        getRandomUUID() { return crypto.randomUUID().replace(/-/g, "").toUpperCase(); },
        isJSON(s) {
            try { const j = JSON.parse(s); return Array.isArray(j) || (typeof j === "object" && j !== null); }
            catch { return false; }
        },
        /**
         * 从文本（完整跳转URL或裸授权码）中提取 OAuth 授权码
         * @param {string} text 用户粘贴的完整URL / 授权码 / 响应文本
         * @returns {string|false} 提取到的授权码，失败返回 false
         */
        extractAuthCode(text) {
            if (!text) return false;
            const str = String(text).trim();
            // 优先按 URL 参数提取（?code=xxx 或 &code=xxx）
            const urlMatch = str.match(/[?&]code=([^&\s"'\\]+)/i);
            if (urlMatch && urlMatch[1]) {
                try { return decodeURIComponent(urlMatch[1]); } catch(_) { return urlMatch[1]; }
            }
            // 兜底：直接匹配 login.live.com 授权码固定格式（M.xxx-x-x-x-x）
            const codeMatch = str.match(/M\.[\w.+]+(?:-[\w+]+){4}/);
            return codeMatch ? codeMatch[0] : false;
        },
        delay(ms) { return new Promise(r => setTimeout(r, ms)); },
        randomDelay(min = 3000, max = 8000) { return this.delay(this.randomRange(min, max)); },
        /**
         * 从 RSC/HTML 文本里截出 `"key":{...}` 或 `"key":[...]` 的完整片段
         * v1.8.6：统一了原先散落在 _fetchRewardsInfo / getServerStats 里的四份手写括号配平代码。
         * @param {string} text 原始文本
         * @param {string} key 字段名（不带引号）
         * @param {number} [maxLen=20000] 最大扫描长度，防止异常文本拖死解析
         * @returns {string|null} 片段原文，未命中返回 null
         */
        jsonBlock(text, key, maxLen = 20000) {
            const found = new RegExp('"' + key + '"\\s*:\\s*').exec(text);
            if (!found) return null;
            let start = found.index + found[0].length;
            while (start < text.length && /\s/.test(text[start])) start++;
            const open = text[start];
            if (open !== "{" && open !== "[") {
                // 非对象/数组：退化为截到下一个逗号
                const end = text.indexOf(",", start);
                return text.slice(start, end === -1 ? Math.min(start + 120, text.length) : end).trim();
            }
            const close = open === "{" ? "}" : "]";
            let depth = 0, inString = false, escaped = false;
            for (let i = start; i < text.length && i - start < maxLen; i++) {
                const ch = text[i];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch === "\\") escaped = true;
                    else if (ch === "\"") inString = false;
                    continue;
                }
                if (ch === "\"") { inString = true; continue; }
                if (ch === open) depth++;
                else if (ch === close && --depth === 0) return text.slice(start, i + 1);
            }
            return null;
        }
    };

    const API = {
        /**
         * 构造 DAPI 请求头（v1.8.6：原先 8 处调用各自手写同一份头，合并到此）
         * @param {string} token Bearer token
         * @param {string} [region="cn"] 国家码
         * @param {boolean} [withPartner=false] 是否附带 x-rewards-partnerid: startapp
         * @returns {Object} 请求头对象
         */
        dapiHeaders(token, region = "cn", withPartner = false) {
            return {
                "content-type": "application/json; charset=UTF-8",
                "user-agent": RewardsAuto.ua.app,
                "authorization": `Bearer ${token}`,
                "x-rewards-appid": RewardsAuto.appConfig.rewardsAppId,
                "x-rewards-ismobile": "true",
                "x-rewards-country": region,
                "x-rewards-language": "zh",
                ...(withPartner ? { "x-rewards-partnerid": "startapp" } : {})
            };
        },

        async getToken(url, maxRetries = 3) {
            const isCodeGrant = url.includes("grant_type=authorization_code");
            const sentCode = isCodeGrant ? Utils.extractAuthCode(url) : "";
            const sentRefresh = isCodeGrant
                ? ""
                : decodeURIComponent((url.match(/refresh_token=([^&]+)/) || [])[1] || "");
            const beforeAccess = GM_getValue("Config.accessToken", false);
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const res = await Utils.xhr({ url });
                    if (!Utils.isJSON(res)) {
                        if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                        return false;
                    }
                    const data = JSON.parse(res);
                    if (data.error) {
                        Utils.log("🔴", `Token错误: ${data.error} - ${data.error_description || ''}`);
                        Utils.debug("token", `授权失败 grant=${isCodeGrant ? "code" : "refresh"} error=${data.error} desc=${String(data.error_description || "").slice(0, 200)}`);
                        // 持久化最近一次失败原因：跨上下文的诊断面板能看到真实 OAuth 错误
                        GM_setValue("Config.lastTokenError", {
                            t: Date.now(),
                            grant: isCodeGrant ? "code" : "refresh",
                            error: data.error,
                            description: String(data.error_description || "").slice(0, 200)
                        });
                        if (["invalid_grant","invalid_request"].includes(data.error)) {
                            const currentToken = GM_getValue("Config.token", false);
                            const currentCode = Utils.extractAuthCode(GM_getValue("Config.code", ""));
                            const currentAccess = GM_getValue("Config.accessToken", false);
                            // 只清理“本次请求实际使用的凭据”，避免并发/旧请求把另一上下文刚保存的新 token 擦掉
                            if (isCodeGrant) {
                                if (sentCode && currentCode === sentCode) GM_setValue("Config.code", "");
                            } else if (sentRefresh && currentToken === sentRefresh) {
                                GM_setValue("Config.token", false);
                            }
                            if (!isCodeGrant && (!currentAccess || currentAccess === beforeAccess)) {
                                GM_setValue("Config.accessToken", false);
                                GM_setValue("Config.accessExpiresAt", 0);
                            }
                        }
                        return false;
                    }
                    if (data.access_token) {
                        const now = Utils.getTimestamp();
                        GM_setValue("Config.accessToken", data.access_token);
                        // 提前 2 分钟过期，避免边界时刻拿到刚失效的 token
                        GM_setValue("Config.accessExpiresAt", now + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000);
                        if (data.refresh_token) {
                            GM_setValue("Config.token", data.refresh_token);
                            GM_setValue("Config.tokenTime", now);
                        }
                        if (url.includes("grant_type=authorization_code")) GM_setValue("Config.authTime", now);
                        Utils.debug("token", `授权成功 grant=${isCodeGrant ? "code" : "refresh"} access=ok refresh=${data.refresh_token ? "有" : "无"}`);
                        GM_setValue("Config.lastTokenError", null);
                        RewardsAuto.state.token = data.access_token;
                        return true;
                    }
                    if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                    return false;
                } catch (e) {
                    Utils.debug("token", `Token 请求异常 grant=${isCodeGrant ? "code" : "refresh"} ${e.message}`);
                    if (e.message.includes("400") || e.message.includes("401")) {
                        // 网络/代理瞬态错误也可能表现为 400/401，不能因此丢掉 refresh_token；
                        // 真正的 invalid_grant 会在上面的 JSON error 分支清理。
                        Utils.debug("token", `Token HTTP 错误，保留 refresh_token: ${e.message}`);
                        GM_setValue("Config.lastTokenError", {
                            t: Date.now(),
                            grant: isCodeGrant ? "code" : "refresh",
                            error: "http",
                            description: String(e.message).slice(0, 200)
                        });
                        return false;
                    }
                    if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                    Utils.log("🔴", `Token请求失败: ${e.message}`);
                    return false;
                }
            }
            return false;
        },

        async withTokenRetry(requestFn) {
            let token = RewardsAuto.state.token;
            if (!token) {
                const ok = await this.renewToken();
                if (!ok) return null;
                token = RewardsAuto.state.token;
                if (!token) return null;
            }
            try {
                return await requestFn(token);
            } catch (e) {
                if (e.message && e.message.includes("401")) {
                    Utils.log("🟡", "Token 过期，尝试用 refresh_token 续期...");
                    RewardsAuto.state.token = null;
                    // 只清 access token，保留 refresh_token 以便无感续期
                    GM_setValue("Config.accessToken", false);
                    GM_setValue("Config.accessExpiresAt", 0);
                    const refreshed = await this.renewToken(true);
                    if (!refreshed) return null;
                    return await requestFn(RewardsAuto.state.token);
                }
                throw e;
            }
        },

        async renewToken(force = false, code = "", allowAuto = true) {
            // access_token 默认有效 1 小时，直接复用，避免每次定时轮询都刷新
            if (!force && !code) {
                const cachedAccess = GM_getValue("Config.accessToken", false);
                const cachedExp = Number(GM_getValue("Config.accessExpiresAt", 0));
                if (cachedAccess && cachedExp > Date.now()) {
                    RewardsAuto.state.token = cachedAccess;
                    return true;
                }
            }
            if (this._renewPromise) {
                // 带授权码的请求不能被进行中的“无码续期”吞掉（PC3 实际故障：
                // 定时轮询正在自动抓码时用户粘贴授权码，粘贴直接返回了自动抓码的失败结果，
                // 码根本没被使用）。等待进行中的流程结束，若仍未产生可用凭据，再用本次码重新执行。
                if (this._renewHadCode || !code) return this._renewPromise;
                const prior = await this._renewPromise.catch(() => false);
                if (prior || this.hasUsableToken()) return true;
            }
            this._renewHadCode = Boolean(code);
            this._renewPromise = this._renewToken(force, code, allowAuto).finally(() => {
                this._renewPromise = null;
                this._renewHadCode = false;
            });
            return this._renewPromise;
        },

        /**
         * 判断存储中当前是否存在可用凭据（refresh_token 或仍在有效期内的 access_token）
         * @returns {boolean}
         */
        hasUsableToken() {
            if (GM_getValue("Config.token", false)) return true;
            const access = GM_getValue("Config.accessToken", false);
            return Boolean(access && Number(GM_getValue("Config.accessExpiresAt", 0)) > Date.now());
        },

        async _renewToken(force = false, code = "", allowAuto = true) {
            // 没有启用任何需要 DAPI 的任务时，不必强制走授权流程
            const tokenNeeded = ["Tasks.sign", "Tasks.read", "Tasks.promos", "Tasks.search"]
                .some(key => GM_getValue(key, true));
            if (!tokenNeeded && !GM_getValue("Config.token", false)) return true;
            // 每次授权流程重置一次性授权码标志，允许使用新粘贴的授权码
            RewardsAuto._codeExchanged = false;
            // 手动粘贴授权码时强制走 code 分支，但先不删除旧 refresh_token：
            // 只有新授权成功后才由 getToken 覆盖，失败则保留旧 token 继续用。
            let refreshToken = code ? false : GM_getValue("Config.token", false);
            // authTime 是授权码换取 token 的时间；刷新 token 不应延长重新授权周期。
            // 30 天仅作为兜底：正常失效由 invalid_grant 触发，避免 7 天就打断自动化。
            const AUTH_MAX_DAYS = 30;
            const authTime = Number(GM_getValue("Config.authTime", 0) || GM_getValue("Config.tokenTime", 0));
            if (authTime > 0) {
                const days = (Utils.getTimestamp() - authTime) / (1000 * 60 * 60 * 24);
                if (days > AUTH_MAX_DAYS) {
                    Utils.log("🟡", `授权已${Math.floor(days)}天，超过 ${AUTH_MAX_DAYS} 天，重新授权`);
                    refreshToken = false;
                }
            }
            const authUrl = "https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&response_type=code&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&redirect_uri=https://login.live.com/oauth20_desktop.srf";
            /**
             * 获取授权码：优先使用用户手动粘贴的授权码，其次尝试自动跟随重定向抓取
             * @param {string} msg 提示信息
             * @returns {Promise<string[]|false>} [授权码] 或 false
             */
            const fetchCode = async (msg) => {
                // 1) 优先读取用户手动粘贴的授权码；读取后立即消费，避免另一上下文重复兑换同一码
                const manualCode = Utils.extractAuthCode(code || GM_getValue("Config.code", ""));
                if (manualCode) {
                    if (!code) GM_setValue("Config.code", "");
                    Utils.log("🟢", `${msg}，使用手动粘贴的授权码`);
                    return [manualCode];
                }
                // 2) 明确禁用自动抓取时（登录回调页）直接失败返回：
                //    回调页拿不到码只可能是“码已被其他上下文消费”，此时跟随重定向
                //    几乎必然拿不到 code，只会多写一条误导性的 no_code 错误
                if (!allowAuto) {
                    GM_setValue("Config.lastTokenError", {
                        t: Date.now(),
                        grant: "direct",
                        error: "code_consumed",
                        description: "存储中无授权码（可能已被其他上下文消费），已跳过自动抓取"
                    });
                    return false;
                }
                Utils.log("🟡", `${msg}，尝试自动获取授权码...`);
                // 3) 自动获取：跟随重定向从 finalUrl 中提取 code
                try {
                    const res = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET", url: authUrl,
                            headers: { "User-Agent": navigator.userAgent },
                            onload: (r) => resolve(r),
                            onerror: () => reject(new Error("请求失败")),
                            ontimeout: () => reject(new Error("超时")),
                            timeout: 15000
                        });
                    });
                    const code = Utils.extractAuthCode(res.finalUrl || "");
                    if (code) {
                        Utils.log("🟢", "自动获取授权码成功");
                        return [code];
                    }
                    // 3) 兜底：redirect:manual 场景下 code 可能藏在响应体中
                    const bodyCode = Utils.extractAuthCode(res.responseText || "");
                    if (bodyCode) {
                        Utils.log("🟢", "自动获取授权码成功（响应体）");
                        return [bodyCode];
                    }
                } catch (e) {
                    Utils.log("🟡", `自动获取失败: ${e.message}`);
                }
                GM_setValue("Config.lastTokenError", {
                    t: Date.now(),
                    grant: "auto",
                    error: "no_code",
                    description: "跟随重定向未返回 code（login.live.com 可能未登录或需人工验证）"
                });
                Utils.notifyError("tokenAuth", "自动获取授权码失败，请在脚本菜单中点击「🔑 手动授权」进行授权，然后复制完整的跳转URL到「📋 粘贴授权码」");
                if (GM_getValue("Notice.bro", true)) {
                    try {
                        GM_notification({
                            text: "自动授权失败，请手动点击脚本菜单「🔑 手动授权」",
                            title: "🔴 需要手动授权", timeout: 0
                        });
                    } catch(_) {}
                }
                return false; // 阻止后续的循环等待，直接退出授权流程
            };

            if (!refreshToken) {
                if (RewardsAuto._codeExchanged) {
                    GM_setValue("Config.lastTokenError", {
                        t: Date.now(),
                        grant: "code",
                        error: "code_blocked",
                        description: "授权码已使用过，被阻断，需重新手动授权"
                    });
                    Utils.notifyError("tokenInvalid", "授权码已使用过仍无效，请重新手动授权获取新的授权码");
                    return false;
                }
                const codeMatch = await fetchCode("检测到授权码为空");
                if (!codeMatch) return false;
                // 授权码一次性：无论成败都标记已使用，防止失效码死循环
                RewardsAuto._codeExchanged = true;
                const url = `https://login.live.com/oauth20_token.srf?client_id=0000000040170455&code=${encodeURIComponent(codeMatch[0])}&redirect_uri=https://login.live.com/oauth20_desktop.srf&grant_type=authorization_code`;
                const token = await this.getToken(url);
                if (!token) {
                    // 授权码已失效，清除存储的失效值，等待用户重新粘贴
                    GM_setValue("Config.code", "");
                    Utils.notifyError("tokenInvalid", "授权码已失效或已被使用，请重新点击「🔑 手动授权」并粘贴新的跳转URL");
                    return false;
                }
                GM_setValue("Config.code", "");
                Utils.log("🟢", "Token获取成功！", true);
                return true;
            } else {
                const url = `https://login.live.com/oauth20_token.srf?client_id=0000000040170455&refresh_token=${encodeURIComponent(refreshToken)}&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&grant_type=REFRESH_TOKEN`;
                const token = await this.getToken(url);
                if (!token) {
                    if (RewardsAuto._codeExchanged) {
                        Utils.notifyError("tokenInvalid", "Token 续期失败，请重新手动授权");
                        return false;
                    }
                    const retry = await fetchCode("Token失效");
                    if (!retry) return false;
                    // 不在这里清 refresh_token：若新授权码也失败，旧 token 仍可留作下次重试；
                    // 授权码成功后 getToken 会直接覆盖成新的 refresh_token。
                    RewardsAuto._codeExchanged = true;
                    const codeUrl = `https://login.live.com/oauth20_token.srf?client_id=0000000040170455&code=${encodeURIComponent(retry[0])}&redirect_uri=https://login.live.com/oauth20_desktop.srf&grant_type=authorization_code`;
                    const codeToken = await this.getToken(codeUrl);
                    if (!codeToken) {
                        GM_setValue("Config.code", "");
                        Utils.notifyError("tokenInvalid", "授权码已失效或已被使用，请重新手动授权");
                        return false;
                    }
                    GM_setValue("Config.code", "");
                    Utils.log("🟢", "Token获取成功！", true);
                    return true;
                }
                return true;
            }
        },

        /**
         * 获取 earn 页面 HTML（60 秒缓存，多个阶段共享，避免重复拉取大页面）
         * @param {boolean} force 是否强制刷新
         * @returns {Promise<string>} HTML
         */
        async getEarnHtml(force = false) {
            if (force) {
                const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                Utils.cacheSet("earnHtml", html, 60_000);
                return html;
            }
            return Utils.cached("earnHtml", 60_000, () => Utils.xhr({ url: "https://rewards.bing.com/earn" }));
        },

        /**
         * 获取积分概览（45 秒缓存；force 用于搜索结束后的最终复核）
         * @param {number} maxRetries 最大重试次数
         * @param {boolean} force 是否跳过缓存
         * @returns {Promise<Object|false>} 概览
         */
        async getRewardsInfo(maxRetries = 3, force = false) {
            if (force) {
                const result = await this._fetchRewardsInfo(maxRetries, true);
                if (result) Utils.cacheSet("rewardsInfo", result, 45_000);
                else Utils.cacheDelete("rewardsInfo");
                return result;
            }
            const result = await Utils.cached("rewardsInfo", 45_000, () => this._fetchRewardsInfo(maxRetries, false));
            if (!result) Utils.cacheDelete("rewardsInfo");
            return result;
        },

        async _fetchRewardsInfo(maxRetries = 3, force = false) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const html = await this.getEarnHtml(force);
                    const clean = html.replace(/\\+"/g, '"');
                    let balance = 0;
                    let pcMax = 60, pcCur = 0, mobMax = 0, mobCur = 0;
                    let dailyOffer = 0;
                    let earnedToday = null;
                    let searchQuotaFound = false;
                    let searchStep = 0;
                    const ptsStr = Utils.jsonBlock(clean, "pointsCounters", 500);
                    if (ptsStr) {
                        try {
                            const pts = JSON.parse(ptsStr);
                            pcMax = pts.pc?.max ?? 60;
                            pcCur = pts.pc?.progress ?? 0;
                            mobMax = pts.mobile?.max ?? 0;
                            mobCur = pts.mobile?.progress ?? 0;
                            dailyOffer = pts.dailyOffer ?? 0;
                            if (pts.totalPoints != null) {
                                // totalPoints 是今日获取，余额必须走 balance/availablePoints
                                earnedToday = Number(pts.totalPoints);
                            }
                        } catch {}
                    }
                    const balMatch = clean.match(/"balance":(\d+)/) || clean.match(/"availablePoints":(\d+)/);
                    if (balMatch) balance = parseInt(balMatch[1]);
                    const todayDetails = [];
                    const cardsStr = Utils.jsonBlock(clean, "activityCards", 5000);
                    if (cardsStr) {
                        const cardRegex = /"title":"([^"]+)".*?"points":(\d+).*?"isCompleted":(true|false)/g;
                        let cardMatch;
                        while ((cardMatch = cardRegex.exec(cardsStr)) !== null) {
                            const title = cardMatch[1];
                            const points = parseInt(cardMatch[2]);
                            const isCompleted = cardMatch[3] === "true";
                            if (points > 0 && isCompleted) todayDetails.push({ title, points });
                        }
                    }
                    const toNum = value => parseInt(String(value).replace(/,/g, ''), 10) || 0;
                    const searchRowMatch = clean.match(/<p>\s*必应搜索\s*<\/p>\s*<\/div>\s*<div(?=[^>]*justify-self-end)[^>]*>([\s\S]{0,500}?)<\/div>/i);
                    const searchHtmlMatch = searchRowMatch
                        ? (searchRowMatch[1].match(/<span[^>]*>([\d,]+)<\/span>\s*<span[^>]*>\s*\/\s*([\d,]+)\s*<\/span>/i)
                            || searchRowMatch[1].match(/([\d,]+)\s*\/\s*([\d,]+)/))
                        : null;
                    if (searchHtmlMatch) {
                        pcCur = toNum(searchHtmlMatch[1]);
                        pcMax = toNum(searchHtmlMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                        Utils.log("🔍", `页面表格配额: PC ${pcCur}/${pcMax}`);
                    }
                    const searchRscMatch = clean.match(/"combinedSearch":\{[^}]*"progress":(\d+)[^}]*"max":(\d+)/);
                    if (searchRscMatch && !todayDetails.some(d => d.title === '必应搜索')) {
                        pcCur = toNum(searchRscMatch[1]);
                        pcMax = toNum(searchRscMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                    }
                    const stepMatch = clean.match(/每次搜索可获得\s*(\d+)\s*积分/);
                    if (stepMatch) searchStep = parseInt(stepMatch[1], 10) || 0;
                    if (dailyOffer > 0) todayDetails.push({ title: '优惠', points: dailyOffer });
                    const otherActivityRegex = /<p>([^<]+)<\/p><\/div><div[^>]*>(\d+)<\/div>/g;
                    let otherMatch;
                    while ((otherMatch = otherActivityRegex.exec(clean)) !== null) {
                        const title = otherMatch[1];
                        const points = parseInt(otherMatch[2]);
                        if (points > 0 && !todayDetails.some(d => d.title === title)) {
                            todayDetails.push({ title, points });
                        }
                    }
                    const history = { month: 0, year: 0, lifetime: 0 };
                    let historyParsed = false;
                    const histStr = Utils.jsonBlock(clean, "pointsHistory", 1200);
                    if (histStr) {
                        try {
                            const hist = JSON.parse(histStr);
                            history.month = Number(hist.thisMonth?.earn) || 0;
                            history.year = Number(hist.thisYear?.earn) || 0;
                            history.lifetime = Number(hist.lifetime?.earn) || 0;
                            historyParsed = true;
                        } catch (_) {}
                    }
                    if (!historyParsed) {
                        const pick = (htmlRe, jsonRe) => {
                            const htmlHit = clean.match(htmlRe);
                            if (htmlHit) return parseInt(String(htmlHit[1]).replace(/,/g, ''), 10) || 0;
                            const jsonHit = clean.match(jsonRe);
                            return jsonHit ? parseInt(jsonHit[1], 10) || 0 : 0;
                        };
                        history.month = pick(/本月.*?(\d[\d,]*)<\/div>/, /"monthlyPoints":(\d+)/);
                        history.year = pick(/今年.*?(\d[\d,]*)<\/div>/, /"yearlyPoints":(\d+)/);
                        history.lifetime = pick(/生存期.*?(\d[\d,]*)<\/div>/, /"lifetimePoints":(\d+)/);
                    }
                    const base = { balance, earnedToday, pc: { progress: pcCur, max: pcMax, step: searchStep }, mobile: { progress: mobCur, max: mobMax }, dailyOffer, todayDetails, history };
                    if (!searchQuotaFound) {
                        const userInfoResult = await this.getSearchQuotaFromUserInfo();
                        if (userInfoResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 dashboard 服务端数据兜底");
                            return {
                                ...base,
                                balance: userInfoResult.balance ?? base.balance,
                                pc: { ...base.pc, ...(userInfoResult.pc || {}) },
                                readProgress: userInfoResult.readProgress,
                                readMax: userInfoResult.readMax
                            };
                        }
                    }
                    if (!searchQuotaFound && RewardsAuto.state.token) {
                        const apiResult = await this.getSearchQuotaFromAPI();
                        if (apiResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 DAPI 兜底");
                            return {
                                ...base,
                                balance: apiResult.balance ?? base.balance,
                                pc: { ...base.pc, ...(apiResult.pc || {}) },
                                readProgress: apiResult.readProgress,
                                readMax: apiResult.readMax
                            };
                        }
                    }
                    return base;
                } catch (e) {
                    if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                    Utils.log("🔴", `仪表盘获取失败: ${e.message}`);
                    return false;
                }
            }
            return false;
        },

        async signApp() {
            const region = GM_getValue("Config.lock", true) ? "cn" : RewardsAuto.state.region.toLowerCase();
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: {
                        ...API.dapiHeaders(token, region, true),
                        "x-rewards-flights": "rwgobig"
                    },
                    data: JSON.stringify({
                        amount: 1, id: Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24),
                        type: 103, country: region, channel: RewardsAuto.appConfig.channel
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const response = data.response || {};
                    Utils.debug("sign-app", `响应: ${String(res).slice(0, 600)}`);
                    if (response.activity) return Number(response.activity.p || response.activity.points || 0);
                    if (response.isDuplicate || response.activity === null) return 0;
                    Utils.log("🟡", `App签入响应未确认: ${String(res).slice(0, 120)}`);
                }
            } catch (e) {
                Utils.log("🔴", `App签入失败: ${e.message}`);
            }
            return -1;
        },

        // 旧版网页上报链路（getRequestVerificationToken / reportActivity → /api/reportactivity）
        // 已于 2026-11 站点下线（实测 POST 返回 401 旧版错误页），故整体移除；
        // 需要上报的任务改走 Server Action（reportActivity/reportClaimAllPoints）或 cn.bing.com 的 rewardsapp 接口。

        async reportDailyActivity(searchUrl) {
            try {
                const fullUrl = searchUrl.startsWith("http") ? searchUrl : `https://cn.bing.com${searchUrl}`;
                const ig = Utils.getRandomUUID().replace(/-/g, '').substring(0, 32).toUpperCase();
                const cnUrl = fullUrl.replace(/^https?:\/\/www\.bing\.com/, "https://cn.bing.com")
                                     .replace(/^https:\/\/bing\.com/, "https://cn.bing.com");
                const cnUrlObj = new URL(cnUrl);
                const cnSp = cnUrlObj.searchParams;
                const reportParams = new URLSearchParams();
                reportParams.set("IG", ig);
                reportParams.set("IID", "commerce.5067");
                if (cnSp.get("form")) reportParams.set("form", cnSp.get("form"));
                if (cnSp.get("ocid") || cnSp.get("OCID")) reportParams.set("ocid", cnSp.get("ocid") || cnSp.get("OCID"));
                if (cnSp.get("rnoreward")) reportParams.set("rnoreward", cnSp.get("rnoreward"));
                // 落地页只在 bing 域内访问：第三方推广链接（如广告页）不在 @connect 白名单，
                // 强行请求会被浏览器拒绝并抛出无上下文的 verify error，且对计分无帮助
                const isBingHost = /(^|\.)bing\.com$/i.test(cnUrlObj.hostname);
                if (isBingHost) {
                    try {
                        await Utils.xhr({
                            method: "GET", url: cnUrl,
                            headers: {
                                "user-agent": RewardsAuto.ua.pc,
                                "referer": "https://rewards.bing.com/",
                                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
                            }
                        });
                    } catch (_) {}
                } else {
                    Utils.debug("report-activity", `跳过非 bing 落地页访问: ${cnUrlObj.hostname}`);
                }
                const ncheaderParams = new URLSearchParams();
                ncheaderParams.set("ver", String(Date.now()).substring(0, 8));
                ncheaderParams.set("IID", "commerce.5057");
                ncheaderParams.set("IG", ig);
                try {
                    await Utils.xhr({
                        method: "POST",
                        url: `https://cn.bing.com/rewardsapp/ncheader?${ncheaderParams.toString()}`,
                        headers: {
                            "content-type": "application/x-www-form-urlencoded",
                            "user-agent": RewardsAuto.ua.pc,
                            "referer": cnUrl,
                            "origin": "https://cn.bing.com",
                            "accept": "*/*",
                            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
                        },
                        data: "wb=1;i=1;v=1"
                    });
                } catch (_) {}
                const bodyParams = new URLSearchParams();
                bodyParams.set("url", cnUrl);
                bodyParams.set("V", "web");
                await Utils.xhr({
                    method: "POST",
                    url: `https://cn.bing.com/rewardsapp/reportActivity?${reportParams.toString()}`,
                    headers: {
                        "content-type": "application/x-www-form-urlencoded",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": cnUrl,
                        "origin": "https://cn.bing.com",
                        "accept": "*/*",
                        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
                    },
                    data: bodyParams.toString()
                });
                return true;
            } catch (e) {
                Utils.log("🟡", `每日活动上报失败: ${e.message}`);
                return false;
            }
        },

        async signPC() {
            // 2026-11 版站点已下线 /api/reportactivity（实测 401 + 旧版错误页），
            // PC 签到改由搜索行为触发服务端计数器（DailyCheckIn_Bing_CompletionCheck），
            // 这里不发无效请求，交由 doSearch 之后的 recheckPCSign 复核。
            Utils.debug("sign-pc", "旧版 PC 签到接口已下线，改由搜索触发服务端计数器");
            return -1;
        },

        /**
         * 获取 DAPI 任务列表（新版后台接口，任务数据最可靠）
         * @returns {Promise<Array|false>} 标准化任务数组，失败返回 false
         */
        async getDAPIPromos(force = false) {
            // 511 概览已经包含 promotions，直接复用，避免同一接口请求 2~4 次
            const overview = await this.getDAPIOverview(force);
            if (!overview) return false;
            return (overview.promotions || []).map(p => ({ ...p }));
        },

        /**
         * 获取 DAPI 账户概览（可用余额 + 推广任务）
         * @returns {Promise<Object|false>} { balance, promotions } 或 false
         */
        async getDAPIOverview(force = false) {
            if (force) {
                const result = await this._fetchDAPIOverview();
                if (result) Utils.cacheSet("dapi511", result, 45_000);
                else Utils.cacheDelete("dapi511");
                return result;
            }
            const result = await Utils.cached("dapi511", 45_000, () => this._fetchDAPIOverview());
            if (!result) Utils.cacheDelete("dapi511");
            return result;
        },

        async _fetchDAPIOverview() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=511",
                    headers: {
                        ...API.dapiHeaders(token, "cn", false)
                    }
                }));
                if (!Utils.isJSON(res)) return false;
                const response = JSON.parse(res).response || {};
                const promotions = (Array.isArray(response.promotions) ? response.promotions : [])
                    .map(p => {
                        const a = p?.attributes || {};
                        // 2026-11 起服务端不再返回 offerid/type/pointProgressMax：
                        // 任务标识改由 name 承载（如 ENUS_readarticle3_30points_Default），
                        // 类型需要按名称推断，进度上限 attributes.max 即该任务可得积分。
                        const offerId = String(a.offerid || p?.name || "");
                        return {
                            offerId,
                            title: a.title || p?.name || "",
                            type: String(a.type || "").toLowerCase() || this._classifyOffer(offerId),
                            hidden: String(a.hidden).toLowerCase() === "true",
                            complete: String(a.complete).toLowerCase() === "true",
                            progress: Number(a.progress ?? a.activityprogress ?? 0) || 0,
                            max: Number(a.max ?? a.activitymax ?? 0) || 0,
                            points: Number(p?.pointProgressMax ?? a.pointmax ?? a.max ?? 0) || 0,
                            destination: a.destination || p?.destinationUrl || "",
                            hash: p?.hash || ""
                        };
                    })
                    .filter(p => p.offerId);
                return { balance: Number(response.balance || 0), promotions, counters: response.counters || {} };
            } catch (e) {
                Utils.log("🟡", `DAPI概览获取失败: ${e.message}`);
                return false;
            }
        },

        /**
         * 按 offerId 推断任务类型（新版 DAPI 不再下发 type 字段）
         * @param {string} offerId 任务标识
         * @returns {string} 类型代号
         */
        _classifyOffer(offerId) {
            const id = String(offerId || "");
            if (/readarticle|read_?article/i.test(id)) return "msnreadearn";
            if (/AppNewBonus/i.test(id)) return "appbonus";
            if (/Gamification_DailySet_/i.test(id)) return "dailyset";
            if (/DailyCheckIn_Bing_/i.test(id)) return "checkin";
            if (/DailyCheckIn_Sapphire|DailyCheckIn$/i.test(id)) return "checkin";
            if (/streak/i.test(id)) return "streak";
            if (/search/i.test(id)) return "search";
            return "";
        },

        /**
         * 把 dashboard HTML 中的 RSC flight 片段拼装成可解析文本
         * @param {string} html 页面 HTML
         * @returns {string} 拼装后的文本
         */
        rscText(html) {
            if (!html) return "";
            const parts = [];
            const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
            let m;
            while ((m = re.exec(String(html))) !== null) {
                try { parts.push(JSON.parse(m[1])); } catch (_) {}
            }
            return parts.length ? parts.join("") : String(html);
        },

        /**
         * 解析 dashboard 服务端渲染数据
         * 说明：2026-11 版站点改为纯服务端渲染，旧 /api/getuserinfo 已返回 401，
         *      余额/等级/连签/待领取积分都内联在 flight 片段中，这里统一提取。
         * @param {string} html dashboard 页面 HTML
         * @returns {Object} 解析结果（未命中为 null）
         */
        parseDashboardHtml(html) {
            const out = {
                balance: null, level: null, pointsPerSearch: null, streak: null,
                pointClaim: null, lifetimeEarn: null, lifetimeSpend: null, dailySetExpiresAt: null
            };
            try {
                const text = this.rscText(html);
                const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
                out.balance = num(/"balance":(\d+)/);
                out.level = num(/"level":(\d+)/);
                out.pointsPerSearch = num(/"pointsPerSearch":(\d+)/);
                out.streak = num(/"streakCounter":(\d+)/);
                out.lifetimeEarn = num(/"lifetimeEarn":(\d+)/);
                out.lifetimeSpend = num(/"lifetimeSpend":(\d+)/);
                out.pointClaim = num(/"pointClaim":\s*\{[^}]{0,120}?"points":\s*(\d+)/);
                const exp = text.match(/"expiresAt":"\$?D?([^"]+)"/);
                if (exp) out.dailySetExpiresAt = exp[1];
            } catch (e) {
                Utils.debug("dashboard", `RSC 解析失败: ${e.message}`);
            }
            return out;
        },

        /**
         * 读取 dashboard 服务端渲染数据（60 秒缓存）
         * @param {boolean} force 是否强制刷新
         * @returns {Promise<Object>} 数据
         */
        async getDashboardData(force = false) {
            const load = async () => {
                const html = await Utils.xhr({
                    url: "https://rewards.bing.com/dashboard",
                    headers: {
                        "user-agent": RewardsAuto.ua.pc,
                        "accept": "text/html,application/xhtml+xml"
                    }
                });
                const data = this.parseDashboardHtml(html);
                Utils.debug("dashboard", `RSC balance=${data.balance} claim=${data.pointClaim} streak=${data.streak} step=${data.pointsPerSearch}`);
                return data;
            };
            if (force) {
                const data = await load();
                Utils.cacheSet("dashboardData", data, 60_000);
                return data;
            }
            return Utils.cached("dashboardData", 60_000, load);
        },

        /**
         * 解析 reportClaimAllPoints 的 Server Action ID
         * 说明：该动作位于懒加载 chunk（PointsClaimSidePanel），首屏 chunk 中只有
         *      「模块 715223 → 面板 chunk」的映射，因此需要两跳：首屏 chunk → 面板 chunk → action id。
         * @returns {Promise<string>} action id（解析失败返回内置兜底值）
         */
        async getClaimActionId() {
            return Utils.cached("claimActionId", 30 * 60 * 1000, async () => {
                // action id 实为 42 位十六进制（旧正则写死 40 位会漏匹配），此处用 32~64 兼容
                const actionRe = /createServerReference\)?\("([0-9a-f]{32,64})"[^)]*"reportClaimAllPoints"/;
                const grab = async (url) => { try { return String(await Utils.xhr({ url })); } catch (_) { return ""; } };
                let html = "";
                try { html = String(await Utils.xhr({ url: "https://rewards.bing.com/dashboard" })); } catch (_) {}
                const first = [...new Set(html.match(/\/_next\/static\/chunks\/[\w.-]+\.js/g) || [])].slice(0, 40);
                const seen = new Set(first);
                const lazy = new Set();
                // 第一跳：首屏 chunk（同时收集它们引用的懒加载 chunk）
                for (const src of first) {
                    const text = await grab(`https://rewards.bing.com${src}`);
                    const hit = text.match(actionRe);
                    if (hit) {
                        Utils.debug("claim", `action id 来自 ${src}`);
                        return hit[1];
                    }
                    for (const ref of text.match(/static\/chunks\/[\w.-]+\.js/g) || []) {
                        const name = ref.replace(/^.*\//, "");
                        if (name && name.endsWith(".js")) lazy.add(`/_next/static/chunks/${name}`);
                    }
                }
                // 第二跳：懒加载面板（PointsClaimSidePanel 等）里才有 reportClaimAllPoints
                for (const src of [...lazy].filter(x => !seen.has(x)).slice(0, 40)) {
                    const hit = (await grab(`https://rewards.bing.com${src}`)).match(actionRe);
                    if (hit) {
                        Utils.debug("claim", `action id 来自懒加载 ${src}`);
                        return hit[1];
                    }
                }
                Utils.log("🟡", "未动态解析到 reportClaimAllPoints，使用内置 action id");
                return RewardsAuto.appConfig.claimActionId;
            });
        },

        /**
         * 领取「可领取积分」（调用 reportClaimAllPoints Server Action）
         * 实测（2026-11-15）：POST /dashboard，头 Next-Action=actionId，body 为 []，
         *      响应为 RSC 文本，成功时含 "1:true"，之后余额 +3。
         * @returns {Promise<{ok:boolean,reason:string}>} 结果
         */
        async claimAllPoints() {
            const actionId = await this.getClaimActionId();
            if (!actionId) return { ok: false, reason: "缺少 action id" };
            try {
                const cookie = await Utils.getCookieString("https://rewards.bing.com/dashboard");
                const res = await Utils.xhr({
                    method: "POST",
                    url: "https://rewards.bing.com/dashboard",
                    headers: {
                        "accept": "text/x-component",
                        "content-type": "text/plain;charset=UTF-8",
                        "next-action": actionId,
                        "referer": "https://rewards.bing.com/dashboard",
                        "origin": "https://rewards.bing.com",
                        "user-agent": RewardsAuto.ua.pc,
                        ...(cookie ? { "cookie": cookie } : {})
                    },
                    data: "[]",
                    anonymous: false
                });
                const text = String(res || "");
                const ok = /(^|\n)\s*\d+:true\b/.test(text) || /true\s*$/.test(text.trim());
                Utils.debug("claim", `ServerAction: ${text.slice(0, 200)}`);
                return { ok, reason: ok ? "已受理" : `服务端返回 ${text.slice(0, 120)}` };
            } catch (e) {
                return { ok: false, reason: e.message };
            }
        },

        /**
         * 查询当日签到完成状态（以服务端计数器为准）
         * @returns {Promise<{app:boolean,pc:boolean}|null>} 状态，查询失败返回 null
         */
        async getSignStatus() {
            const overview = await this.getDAPIOverview();
            if (!overview) return null;
            const today = String(Utils.getTodayNum());
            const keys = Object.keys(overview.counters || {});
            /**
             * 判断当日是否存在指定前缀的签到计数器
             * @param {string} prefix 计数器前缀
             * @returns {boolean} 是否存在
             */
            const has = (prefix) => keys.some(k => k === `${prefix}${today}`);
            return {
                app: has("DailyCheckIn_Sapphire"),
                pc: has("DailyCheckIn_Bing_CompletionCheck") || has("DailyCheckIn_Bing_ClaimingFlight")
            };
        },

        /**
         * 汇总服务端真实数据，作为推送文案的唯一数据源
         * 说明：今日获取取 earn 页 pointsCounters.totalPoints；余额取 DAPI 511 的 balance
         * @returns {Promise<Object>} 统计结果（unknown 项以 known=false 标记）
         */
        async getServerStats() {
            const [info, overview] = await Promise.all([this.getRewardsInfo(), this.getDAPIOverview()]);
            const stats = {
                balance: null,
                earnedToday: null,
                read: { progress: 0, max: 30, known: false },
                search: { progress: 0, max: 0, known: false },
                checkin: { streak: 0, done: false, known: false },
                signApp: { done: false, known: false },
                signPC: { done: false, known: false },
                dailySet: { done: 0, total: 0, known: false },
                punchcard: { done: 0, total: 0, known: false },
                evergreen: { done: 0, total: 0, known: false },
                claimable: 0,
                appBonus: { done: 0, total: 0, known: false },
                promoTotal: 0,
                completedOfferIds: []
            };
            if (info) {
                if (Number.isFinite(info.earnedToday)) stats.earnedToday = info.earnedToday;
                if (info.pc && info.pc.max > 0) {
                    stats.search = { progress: info.pc.progress, max: info.pc.max, known: true };
                }
                // dashboard 服务端数据兜底会返回阅读进度，不能因为页面未命中搜索配额就丢掉
                if (info.readProgress != null) {
                    stats.read = {
                        progress: Number(info.readProgress) || 0,
                        max: Number(info.readMax) || 30,
                        known: true
                    };
                }
            }
            if (overview) {
                stats.balance = overview.balance;
                const promos = overview.promotions;
                stats.promoTotal = promos.length;
                const dateTag = `_${Utils.getTodayNum()}_`;
                // 签到完成状态以服务端计数器为准（本地接口返回 0 不代表未签到）
                const counterKeys = Object.keys(overview.counters || {});
                const todayNum = String(Utils.getTodayNum());
                /**
                 * 判断服务端当日是否存在指定前缀的签到计数器
                 * @param {string} prefix 计数器前缀
                 * @returns {boolean} 是否存在
                 */
                const hasCounter = (prefix) => counterKeys.some(k => k === `${prefix}${todayNum}`);
                stats.signApp = {
                    done: hasCounter("DailyCheckIn_Sapphire"),
                    known: counterKeys.some(k => k.startsWith("DailyCheckIn_"))
                };
                stats.signPC = {
                    done: hasCounter("DailyCheckIn_Bing_CompletionCheck") || hasCounter("DailyCheckIn_Bing_ClaimingFlight"),
                    known: counterKeys.some(k => k.startsWith("DailyCheckIn_"))
                };
                let dDone = 0, dTotal = 0, pDone = 0, pTotal = 0, eDone = 0, eTotal = 0;
                for (const p of promos) {
                    // 记录服务端已完成的推广，供执行阶段跳过去重
                    if (p.complete || (p.max > 0 && p.progress >= p.max)) {
                        stats.completedOfferIds.push(p.offerId);
                    }
                    // 阅读任务
                    if (p.type === "msnreadearn" || /readarticle/i.test(p.offerId)) {
                        stats.read = { progress: p.progress, max: p.max || 30, known: true };
                        continue;
                    }
                    // PC 搜索任务
                    if (p.type === "search") {
                        if (p.max > 0) stats.search = { progress: p.progress, max: p.max, known: true };
                        continue;
                    }
                    // 每日连续打卡活动（progress 即连签天数）
                    if (p.type === "checkin") {
                        stats.checkin = { streak: p.progress, done: p.progress > 0, known: true };
                        continue;
                    }
                    // 连签计数器不是可执行任务
                    if (p.type === "streak") continue;
                    // 日常任务：仅统计当天日期的子任务（含次日预热条目需排除）
                    if (p.offerId.startsWith("Gamification_DailySet_")) {
                        if (!p.offerId.includes(dateTag) || !/_Child\d+$/i.test(p.offerId)) continue;
                        dTotal++;
                        if (p.complete || (p.max > 0 && p.progress >= p.max)) dDone++;
                        continue;
                    }
                    // 微软 App 专属奖励（Sapphire_AppNewBonus_*）：需在手机 App 内触发，脚本只统计不谎报完成
                    if (/AppNewBonus/i.test(p.offerId)) {
                        stats.appBonus.total++;
                        if (p.complete || (p.max > 0 && p.progress >= p.max)) stats.appBonus.done++;
                        continue;
                    }
                    // 任务卡（打卡/任务链）
                    if (/punchcard|quest/i.test(p.offerId)) {
                        pTotal++;
                        if (p.complete || (p.max > 0 && p.progress >= p.max)) pDone++;
                        continue;
                    }
                    // 每日拼图 / quiz 等活动卡片
                    if (/DailyGlobalOffer_Evergreen/i.test(p.offerId)) {
                        eTotal++;
                        if (p.complete || (p.max > 0 && p.progress >= p.max)) eDone++;
                        continue;
                    }
                    // 待领取积分：已达上限但未确认完成，且非隐藏内部条目
                    if (!p.hidden && p.max > 0 && p.progress >= p.max && !p.complete && p.points > 0) {
                        stats.claimable += p.points;
                    }
                }
                stats.dailySet = { done: dDone, total: dTotal, known: dTotal > 0 };
                stats.punchcard = { done: pDone, total: pTotal, known: pTotal > 0 };
                stats.evergreen = { done: eDone, total: eTotal, known: eTotal > 0 };
                stats.appBonus.known = stats.appBonus.total > 0;
            }
            // DAPI 不可用时优先用 earn 页余额，避免把“未知”显示成 0
            if (stats.balance === null && info && Number.isFinite(Number(info.balance))) {
                stats.balance = Number(info.balance);
            }
            if (stats.balance === null) stats.balance = await this.getBalance();
            return stats;
        },

        /**
         * 通过 DAPI 完成/领取单个任务（urlreward/checkin/msnreadearn 类型通用）
         * @param {string} offerId 任务ID
         * @param {number} type 活动类型（默认 101）
         * @returns {Promise<Object|null>} {points, isDuplicate, balance} 或 null
         */
        async claimDAPI(offerId, type = 101) {
            const region = GM_getValue("Config.lock", true) ? "cn" : (RewardsAuto.state.region || "cn").toLowerCase();
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: {
                        ...API.dapiHeaders(token, region, true)
                    },
                    data: JSON.stringify({
                        amount: 1,
                        country: region,
                        id: Utils.getRandomUUID().replace(/-/g, "").toLowerCase(),
                        type: type,
                        channel: RewardsAuto.appConfig.channel,
                        attributes: { offerid: offerId }
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const points = Number(data.response?.activity?.p || 0);
                    const isDuplicate = Boolean(data.response?.isDuplicate);
                    if (points > 0 || isDuplicate) RewardsAuto.claimedOfferIds.add(offerId);
                    return {
                        points,
                        isDuplicate,
                        balance: Number(data.response?.balance || 0)
                    };
                }
            } catch (e) {
                Utils.log("🟡", `DAPI任务执行失败(${offerId}): ${e.message}`);
            }
            return null;
        },

        async getReadProgress() {
            // 优先从 DAPI 任务列表动态识别阅读任务（兼容各区域 offerid 差异）
            const findReadOffer = async () => {
                const promos = await this.getDAPIPromos();
                if (Array.isArray(promos)) {
                    const hit = promos.find(x => x.type === "msnreadearn" || /readarticle/i.test(x.offerId));
                    if (hit) return hit;
                }
                return null;
            };
            try {
                const offer = await findReadOffer();
                if (offer) {
                    Utils.log("📊", `阅读进度查询: ${offer.progress}/${offer.max} (offerid: ${offer.offerId})`);
                    RewardsAuto._readOfferId = offer.offerId;
                    return { progress: offer.progress, max: offer.max || 30, offerId: offer.offerId, complete: offer.complete };
                }
            } catch (e) {}
            // 兜底：按配置的固定 offerid 查询
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
                    headers: {
                        ...API.dapiHeaders(token, "cn", false)
                    }
                }));
                if (Utils.isJSON(res)) {
                    const promos = JSON.parse(res).response?.promotions || [];
                    const readOfferId = RewardsAuto.appConfig.offerIds.readArticle;
                    const task = promos.find(x => x.attributes?.offerid === readOfferId);
                    if (task && task.attributes) {
                        const progress = parseInt(task.attributes.progress) || 0;
                        const max = parseInt(task.attributes.max) || 30;
                        Utils.log("📊", `阅读进度查询: ${progress}/${max} (offerid: ${readOfferId})`);
                        return { progress, max, offerId: readOfferId };
                    } else {
                        Utils.log("🟡", `阅读任务未找到 (offerid: ${readOfferId})`);
                    }
                } else {
                    Utils.log("🟡", `DAPI 响应不是 JSON: ${String(res).substring(0, 100)}`);
                }
            } catch (e) {
                Utils.log("🔴", `阅读进度获取失败: ${e.message}`);
            }
            return false;
        },

        /**
         * 读取搜索/阅读配额与余额
         * 说明：2026-11 版站点已移除 /api/getuserinfo（返回 401），
         *      配额改用 dashboard 服务端渲染 + DAPI 511 的搜索任务；保留方法名以兼容旧调用。
         * @param {boolean} includeRead 是否附带阅读进度
         * @returns {Promise<Object|false>} 配额（无法确定时返回 false）
         */
        async getSearchQuotaFromUserInfo(includeRead = true) {
            const [dash, overview] = await Promise.all([this.getDashboardData(), this.getDAPIOverview()]);
            const promo = overview ? overview.promotions.find(p => p.type === "search" && p.max > 0) : null;
            if (!promo) return false;
            const pc = { progress: promo.progress, max: promo.max, step: Number(dash?.pointsPerSearch) || 0 };
            let readProgress = 0, readMax = 30;
            if (includeRead) {
                try {
                    const readInfo = await API.getReadProgress();
                    if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                } catch (_) {}
            }
            const balance = overview?.balance ?? dash?.balance ?? 0;
            Utils.log("📊", `配额查询: PC ${pc.progress}/${pc.max}, 阅读 ${readProgress}/${readMax}, 积分 ${balance}`);
            return {
                balance, pc, readProgress, readMax, dailyOffer: 0,
                todayDetails: [{ title: "必应搜索", points: pc.progress, max: pc.max }],
                history: null
            };
        },

        async getSearchStep() {
            return Utils.cached("searchStep", 10 * 60 * 1000, async () => {
                try {
                    // 新版站点在 dashboard RSC 里直接给出每次搜索积分（当前 3）
                    const dash = await this.getDashboardData();
                    const step = Number(dash?.pointsPerSearch) || 0;
                    return step > 0 ? step : 3;
                } catch (_) {
                    return 3;
                }
            });
        },

        /**
         * 用 DAPI（options=511）读取搜索配额，作为页面解析失败时的兜底
         * 说明：旧实现用 options=613 并依赖 counters.pcSearch 数组，2026-11 起这两者都不存在；
         *      511 的 promotions 里仍有搜索任务（WW_search_* / max=60），用它的进度即可。
         * @returns {Promise<Object|false>} 配额
         */
        async getSearchQuotaFromAPI() {
            try {
                const overview = await this.getDAPIOverview();
                if (!overview) return false;
                const promo = overview.promotions.find(p => p.type === "search" && p.max > 0);
                if (!promo) return false;
                let readProgress = 0, readMax = 30;
                try {
                    const readInfo = await API.getReadProgress();
                    if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                } catch (_) {}
                const pc = { progress: promo.progress, max: promo.max, step: await this.getSearchStep() };
                Utils.log("📊", `DAPI查询: PC ${pc.progress}/${pc.max}, 阅读 ${readProgress}/${readMax}, 积分 ${overview.balance}`);
                return { balance: overview.balance, pc, readProgress, readMax, dailyOffer: 0, todayDetails: [], history: null };
            } catch (e) {
                Utils.log("🟡", `DAPI查询失败: ${e.message}`);
            }
            return false;
        },

        async getBalance() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=105",
                    headers: {
                        ...API.dapiHeaders(token, "cn", false)
                    }
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const value = Number(data.response?.balance);
                    return Number.isFinite(value) ? value : null;
                }
            } catch (e) {}
            try {
                // 兜底：dashboard 服务端渲染的 balance（旧 getuserinfo 已返回 401）
                const dash = await this.getDashboardData(true);
                const value = Number(dash?.balance);
                if (Number.isFinite(value)) return value;
            } catch (_) {}
            return null;
        },

        async doRead(offerId) {
            const region = GM_getValue("Config.lock", true) ? "cn" : (RewardsAuto.state.region || "cn").toLowerCase();
            const readOffer = offerId || RewardsAuto._readOfferId || RewardsAuto.appConfig.offerIds.readArticle;
            try {
                const id = Utils.getRandomUUID().replace(/-/g, '').toLowerCase() + Utils.getRandomUUID().replace(/-/g, '').toLowerCase().slice(0, 24);
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: {
                        ...API.dapiHeaders(token, region, false)
                    },
                    data: JSON.stringify({
                        amount: 1, country: region, id: id, type: 101,
                        attributes: { offerid: readOffer }
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return { points: data.response?.activity?.p || 0, isDuplicate: data.response?.isDuplicate || false };
                }
                return null;
            } catch (e) {
                Utils.log("🔴", `阅读请求失败: ${e.message}`);
                return false;
            }
        },

        async discoverCards(force = false) {
            const load = () => this._discoverCards();
            let list;
            if (force) {
                list = await load();
                Utils.cacheSet("cards", list, 180_000);
            } else {
                list = await Utils.cached("cards", 180_000, load);
            }
            return (list || []).filter(c => !RewardsAuto.claimedOfferIds.has(c.offerId));
        },

        async _discoverCards() {
            const cards = [];
            const seenCardKeys = new Set();
            let html = "";
            // 入列卡片（去重、过滤无效项）
            const pushCard = (card) => {
                if (!card || !card.offerId || !card.hash || card.points <= 0) return;
                // DAPI/Flight 会带回明日预热项，避免今天提前上报
                if (/^Gamification_DailySet_/i.test(card.offerId) && !card.offerId.includes(`_${Utils.getTodayNum()}_`)) return;
                const key = `${card.offerId}:${card.hash}`;
                if (seenCardKeys.has(key)) return;
                seenCardKeys.add(key);
                cards.push(card);
            };
            try {
                html = await this.getEarnHtml();
                if (!html) { Utils.log("🔴", "earn 页面返回空"); return cards; }
                const clean = html.replace(/\\+"/g, '"');

                const inferKind = (offerId, title = "") => {
                    const text = `${offerId} ${title}`.toLowerCase();
                    if (/quiz|trivia|question|测验|答案/.test(text)) return "quiz";
                    if (/puzzle|拼图/.test(text)) return "puzzle";
                    if (/image|图片|设计/.test(text)) return "image_creator";
                    if (/explore|search|浏览|探索/.test(text)) return "explore_search";
                    if (/dailyset|daily|每日/.test(text)) return "daily";
                    if (/streak|打卡|连续/.test(text)) return "streak";
                    return "open_only";
                };

                const parseCard = (obj) => {
                    const offerIdMatch = obj.match(/"offerId":"([^"]+)"/i) || obj.match(/"offerid":"([^"]+)"/i);
                    const hashMatch = obj.match(/"hash":"([^"]+)"/) || obj.match(/"activityId":"([^"]+)"/) || obj.match(/"id":"([^"]+)"/);
                    if (!offerIdMatch || !hashMatch) return null;
                    const offerId = offerIdMatch[1];
                    const hash = hashMatch[1];
                    const pointsMatch = obj.match(/"points":(\d+)/);
                    const isCompletedMatch = obj.match(/"isCompleted":(true|false)/i) || obj.match(/"state":"(completed|CLAIMED)"/i);
                    const titleMatch = obj.match(/"title":"([^"]+)"/) || obj.match(/"name":"([^"]+)"/);
                    const points = pointsMatch ? parseInt(pointsMatch[1]) : 0;
                    const isCompleted = isCompletedMatch ? (isCompletedMatch[1] === "true" || isCompletedMatch[1] === "completed") : false;
                    if (isCompleted) return null;
                    const title = titleMatch ? titleMatch[1] : "";
                    const skip = RewardsAuto.skipPatterns.some(p => title.toLowerCase().includes(p.toLowerCase()) || offerId.toLowerCase().includes(p.toLowerCase()));
                    if (skip) return null;
                    // 保留目标链接（访问型卡片需靠它完成上报）
                    const destMatch = obj.match(/"destination(?:Url)?":"([^"]+)"/i);
                    return { title, points, offerId, hash, kind: inferKind(offerId, title), destination: destMatch ? destMatch[1] : "" };
                };

                // 兜底：旧 getuserinfo 已 401 下线，改用 DAPI（options=511）的 promotions 生成卡片
                try {
                    const overview = await API.getDAPIOverview();
                    const skipTypes = new Set(["search", "msnreadearn", "checkin", "dailyset", "streak"]);
                    for (const item of (overview ? overview.promotions : [])) {
                        if (!item.offerId || item.hidden || item.complete) continue;
                        if (item.max > 0 && item.progress >= item.max) continue;
                        if (skipTypes.has(item.type)) continue;
                        const skip = RewardsAuto.skipPatterns.some(p =>
                            String(item.title).toLowerCase().includes(p.toLowerCase()) ||
                            item.offerId.toLowerCase().includes(p.toLowerCase()));
                        if (skip) continue;
                        // DAPI 任务没有 hash，占位为 "1"：领取走 DAPI type=101 通道，不使用 hash
                        pushCard({
                            title: item.title || item.offerId,
                            points: item.points,
                            offerId: item.offerId,
                            hash: "1",
                            kind: inferKind(item.offerId, item.title),
                            source: "dapi",
                            destination: item.destination || "",
                            url: item.destination || "https://rewards.bing.com/"
                        });
                    }
                } catch (e) {
                    Utils.debug("dapi", `活动兜底解析跳过: ${e.message}`);
                }

                // --- [Next.js Flight Chunks & DAPI parsing] ---
                try {
                    const chunks = [];
                    const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
                    let mFlight;
                    while ((mFlight = pushRegex.exec(html)) !== null) {
                        try {
                            const unescaped = JSON.parse(`"${mFlight[1]}"`);
                            chunks.push(unescaped);
                        } catch (_) {}
                    }
                    const fullFlightText = chunks.length > 0 ? chunks.join("") : html.replace(/\\"/g, '"');
                    const offerObjRegex = /\{[^{}]*?"offerId"\s*:\s*"([^"]+)"[^{}]*?\}/g;
                    let om;
                    while ((om = offerObjRegex.exec(fullFlightText)) !== null) {
                        try {
                            const jsonStr = om[0].replace(/:\$undefined/g, ":null").replace(/:\$D[^\",}]+/g, ":null");
                            const item = JSON.parse(jsonStr);
                            if (!item.offerId || !item.hash) continue;
                            if (item.isCompleted === true || item.isLocked === true) continue;
                            const points = Number(item.points || 0);
                            if (points <= 0 && !item.offerId.includes("DailySet")) continue;
                            pushCard({
                                title: item.title || item.name || item.offerId,
                                points: points || 10,
                                offerId: item.offerId,
                                hash: item.hash,
                                kind: inferKind(item.offerId, item.title || ""),
                                destination: item.destination || item.destinationUrl || "",
                                url: "https://rewards.bing.com/earn"
                            });
                        } catch (_) {}
                    }
                } catch (e) {
                    Utils.log("🟡", `Flight 数据解析异常: ${e.message}`);
                }

                if (cards.length === 0) {
                    const dataRegex = /data-offer-id="([^"]+)"[^>]*data-hash="([^"]+)"/gi;
                    let m;
                    while ((m = dataRegex.exec(html)) !== null) {
                        const offerId = m[1];
                        const hash = m[2];
                        const skip = RewardsAuto.skipPatterns.some(p => offerId.toLowerCase().includes(p.toLowerCase()));
                        if (skip) continue;
                        pushCard({ title: "日常任务", points: 10, offerId, hash, kind: "daily" });
                    }
                }

                if (cards.length > 0) {
                    Utils.log("🧩", `成功获取 ${cards.length} 个可执行卡片`);
                } else {
                    Utils.log("🟡", "未发现可执行的活动卡片（可能均已手动完成或被过滤）");
                }
            } catch (e) {
                Utils.log("🔴", `卡片解析失败: ${e.message}`);
            }
            
                // --- [打卡/任务卡（PunchCard）子任务解析] ---
                // 发现页面中所有 /earn/quest/{parentOfferId} 链接，逐个解析子任务并入列
                try {
                    const questIds = [...new Set(
                        [...(html.matchAll(/\/earn\/quest\/([A-Za-z0-9_]+)/g) || [])].map(m => m[1])
                            .concat([...(html.matchAll(/[A-Za-z0-9_]*pcparent[A-Za-z0-9_]*/g) || [])].map(m => m[0]))
                    )];
                    Utils.log("🧩", `发现 ${questIds.length} 个任务卡（quest）入口`);
                    for (const questId of questIds.slice(0, 12)) {
                        // 任务卡逐个拉取可能持续数分钟，刷新运行锁心跳
                        if (TaskManager.runId && !TaskManager.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                        try {
                            const questUrl = `https://rewards.bing.com/earn/quest/${questId}`;
                            const questHtml = await Utils.xhr({
                                url: questUrl,
                                headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/earn" }
                            });
                            await Utils.randomDelay(150, 350);
                            if (!questHtml) continue;
                            const qChunks = [];
                            const qPushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
                            let qm;
                            while ((qm = qPushRegex.exec(questHtml)) !== null) {
                                try { qChunks.push(JSON.parse(`"${qm[1]}"`)); } catch (_) {}
                            }
                            const qText = qChunks.length > 0 ? qChunks.join("") : questHtml.replace(/\\"/g, '"');
                            // 提取含 offerId 的对象（兼容任意 pcchild 命名）
                            const qOfferRegex = /\{[^{}]*?"offerId"\s*:\s*"([^"]+)"[^{}]*?\}/g;
                            let qo;
                            while ((qo = qOfferRegex.exec(qText)) !== null) {
                                try {
                                    const qItem = JSON.parse(qo[0].replace(/:\$undefined/g, ":null").replace(/:\$D[^\",}]+/g, ":null"));
                                    if (!qItem.offerId || !qItem.hash) continue;
                                    if (qItem.isLocked === true || qItem.isCompleted === true) continue;
                                    // 多日搜索类子任务需真实搜索，跳过
                                    if (/search/i.test(qItem.offerId) && /(day|streak|\dx)/i.test(qItem.offerId)) continue;
                                    Utils.log("🧩", `发现任务卡子项: ${qItem.title || qItem.offerId}`);
                                    pushCard({
                                        title: `[任务卡] ${qItem.title || qItem.name || qItem.offerId}`,
                                        points: Number(qItem.points || qItem.pointProgressMax || 10),
                                        offerId: qItem.offerId,
                                        hash: qItem.hash,
                                        kind: "quest_child",
                                        destination: qItem.destination || qItem.destinationUrl || qItem.href || "",
                                        url: questUrl
                                    });
                                } catch (_) {}
                            }
                        } catch (eInner) {
                            Utils.log("🟡", `任务卡 ${questId} 解析跳过: ${eInner.message}`);
                        }
                    }
                } catch (eQuest) {
                    if (eQuest.message === "RUN_LOCK_LOST") throw eQuest;
                    Utils.log("🟡", `任务卡解析跳过: ${eQuest.message}`);
                }

            return cards;
        },

        /**
         * 从页面 JS chunk 中解析 Next.js Server Action ID（支持按动作名识别）
         * @param {string} html 页面 HTML（含 chunk 引用）
         * @param {boolean} force 是否强制重新扫描（忽略已有缓存）
         * @returns {Promise<Object>} {reportActivity, reportClaimAllPoints, all:[]}
         */
        async resolveServerActions(html, force = false) {
            const cached = RewardsAuto._serverActions || GM_getValue("Config.serverActions", null);
            const recent = cached && Date.now() - Number(cached.at || 0) < 10 * 60 * 1000;
            // 只有两个动作都解析到才算完整缓存
            if (!force && cached && cached.reportActivity && cached.reportClaimAllPoints) return cached;
            // 10 分钟内扫描过（即使没找全）也不再重复扫 40 个 chunk，避免每个卡片都重扫
            if (!force && recent) return cached;
            if (this._actionsPromise) return this._actionsPromise;
            this._actionsPromise = this._resolveServerActions(html, force).finally(() => {
                this._actionsPromise = null;
            });
            return this._actionsPromise;
        },

        async _resolveServerActions(html, force = false) {
            const cached = RewardsAuto._serverActions || GM_getValue("Config.serverActions", null);
            const result = {
                reportActivity: cached?.reportActivity || "",
                reportClaimAllPoints: cached?.reportClaimAllPoints || "",
                all: [...(cached?.all || [])],
                names: { ...(cached?.names || {}) }
            };
            try {
                const hex = "[a-f0-9]{40,64}";
                const KNOWN_NON_NAMES = new Set(["callServer", "findSourceMapURL", "encodeFormAction", "default"]);
                // 从 chunk 文本中按 createServerReference/registerServerReference 提取 id 与动作名
                const scan = (jsText) => {
                    const createRegex = new RegExp(`createServerReference\\s*\\)?\\s*\\(\\s*"(${hex})"([\\s\\S]{0,800}?)\\)`, "g");
                    const registerRegex = new RegExp(`registerServerReference\\s*\\)?\\s*\\([^,]+,\\s*"(${hex})"([\\s\\S]{0,800}?)\\)`, "g");
                    const strLitRe = /"([A-Za-z_$][\w$]*)"/g;
                    for (const re of [createRegex, registerRegex]) {
                        let m;
                        while ((m = re.exec(jsText)) !== null) {
                            const id = m[1];
                            if (!result.all.includes(id)) result.all.push(id);
                            const argsBlock = m[2] || "";
                            const candidates = [...argsBlock.matchAll(strLitRe)]
                                .map(x => x[1])
                                .filter(n => !KNOWN_NON_NAMES.has(n) && n.length > 3);
                            const name = candidates.length ? candidates[candidates.length - 1] : "";
                            if (name) result.names[id] = name;
                            if (name === "reportActivity" && !result.reportActivity) result.reportActivity = id;
                            if (name === "reportClaimAllPoints" && !result.reportClaimAllPoints) result.reportClaimAllPoints = id;
                            // 新版打包会把动作名放在调用表达式之后，补充向后窗口匹配
                            const tail = jsText.slice(m.index, m.index + m[0].length + 240);
                            if (!result.reportActivity && /\breportActivity\b/.test(tail)) result.reportActivity = id;
                            if (!result.reportClaimAllPoints && /\breportClaimAllPoints\b/.test(tail)) result.reportClaimAllPoints = id;
                        }
                    }
                };
                if (html && html.includes("_next/static/chunks/")) {
                    const scriptSrcs = [...new Set(html.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_\-/.]+\.js[^"']*/g) || [])];
                    // 扫描完整 chunk 列表，避免 reportClaimAllPoints 位于靠后的 chunk 时被漏掉
                    for (const src of scriptSrcs.slice(0, 40)) {
                        if (TaskManager.runId && !TaskManager.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                        try {
                            const chunkText = await Utils.xhr({ url: "https://rewards.bing.com" + src.split("?")[0] });
                            if (chunkText) scan(chunkText);
                            if (result.reportActivity && result.reportClaimAllPoints) break;
                        } catch (_) {}
                        await Utils.randomDelay(80, 220);
                    }
                }
                if (!result.reportActivity && result.all.length) result.reportActivity = result.all[0];
                result.at = Date.now();
                RewardsAuto._serverActions = result;
                GM_setValue("Config.serverActions", result);
            } catch (e) {
                if (e.message === "RUN_LOCK_LOST") throw e;
                Utils.log("🟡", `Server Action 解析异常: ${e.message}`);
            }
            return result;
        },

        /**
         * 判断这张卡是否属于「需 App 内搜索」类型（form=ML2W4J / ML2Y2H 的 Bing 搜索卡）
         * 说明：v1.8.3 起不再直接跳过这类卡，改为以移动端身份真实搜索一次再上报，
         *      见 _claimCard 的策略 -1。
         * @param {Object} card 卡片对象
         * @returns {boolean} 是否需 App 内搜索
         */
        _isAppSearchCard(card) {
            if (!card) return false;
            if (card.kind === "quiz" || card.kind === "puzzle" || card.kind === "image_creator") return false;
            const dest = String(card.destination || "");
            if (!/bing\.com\/search/i.test(dest)) return false;
            return /(^|[?&])form=(ML2W4J|ML2Y2H)(&|$)/i.test(dest);
        },

        /**
         * 判断一张卡是不是「接口做不到、只能人工」的类型（v1.8.0）
         * 结论来自两处实测：①社区脚本 ref-8787 的注释——只调面板接口对 Quiz 卡无效，
         * 必须真在落地页点掉答案，页面才会带 WQOskey/WQId/WQQI 去上报；
         * ②+10 带锁拼图（VerB_Locked_level2）同样必须真人拼完。
         * @param {Object} card 卡片对象（来自 earn 页或 DAPI）
         * @returns {string} 跳过原因；空字符串表示可以尝试自动完成
         */
        _cardBlockReason(card) {
            const text = `${card.offerId || ""} ${card.title || ""} ${card.destination || ""}`;
            if (card.kind === "quiz" || /quiz|BingQA_Quiz|Homepage%20quiz|form=ML2BF1/i.test(text)) {
                return "需真实作答：Quiz 卡要在落地页点答案后页面才会带凭据上报";
            }
            if (/VerB_Locked_level/i.test(text)) {
                return "需真拼：+10 带锁拼图只能人工完成";
            }
            // form=ML2W4J / ML2Y2H 不再拦截：v1.8.3 起用移动端身份真实搜索后上报
            if (/locked_level|_level2|_level3/i.test(text) && !this._isAppSearchCard(card)) {
                return "等级不足：当前账号等级未达该卡要求";
            }
            return "";
        },

        /**
         * 领取单张卡片
         * @param {Object} card 卡片对象
         * @returns {Promise<boolean>} 是否确认到账
         */
        async claimCard(card) {
            if (!card?.offerId) return false;
            // v1.8.0：先判定这张卡是否属于「脚本做不到、必须人工」的类型，
            // 命中的卡不再浪费一次上报（旧逻辑会当成失败反复重试，还会污染失败计数）
            const blockReason = this._cardBlockReason(card);
            if (blockReason) {
                if (!RewardsAuto.humanNeeded.has(card.offerId)) {
                    RewardsAuto.humanNeeded.set(card.offerId, { title: card.title || card.offerId, reason: blockReason });
                    Utils.log("🟡", `「${card.title || card.offerId}」跳过：${blockReason}`);
                }
                return false;
            }
            if (RewardsAuto.claimedOfferIds.has(card.offerId)) return true;
            const ok = await this._claimCard(card);
            if (ok) RewardsAuto.claimedOfferIds.add(card.offerId);
            return ok;
        },

        async _claimCard(card) {
            const url = card.url || "https://rewards.bing.com/earn";
            const referer = card.url || "https://rewards.bing.com/earn";

            // 带 hash 的卡片优先走 Server Action（网页端真正的领取接口），
            // 只有没有 hash 的纯访问卡片才先走 URL 访问上报。
            // 背景：morePromotions 里的 WW_Rewards_locked_level2_* 也带 destination，
            // 旧逻辑先访问目标页并乐观返回，导致卡片实际未计分（0/15）。
            const isVisitType = ["explore_search", "daily", "open_only"].includes(card.kind) || /explore|search|浏览|探索|learn|了解/i.test(`${card.offerId} ${card.title || ""}`);
            const preferServerAction = Boolean(card.hash && card.offerId);
            if (!preferServerAction && card.destination && card.destination.startsWith("http") && isVisitType) {
                const startedAt = Date.now();
                const ok = await this.reportDailyActivity(card.destination);
                if (ok) return await this.settleCard(card, "访问上报", startedAt);
            }

            // 策略 -1: App 内搜索卡（form=ML2W4J / ML2Y2H）
            // 这类卡只认 Rewards 手机客户端（或桌面 App）内的搜索行为，
            // 用页面 UA 上报会被当成普通网页搜索、卡片不记账。
            // v1.8.3 起以移动端身份（UA=mobile + _Rwho=u=m）真实打开搜索页，
            // 取页面 IG 后按 SERP 协议上报，再回查卡片状态。
            if (this._isAppSearchCard(card)) {
                const startedAt = Date.now();
                try {
                    const dest = String(card.destination || "");
                    let form = "ML2W4J";
                    let query = "";
                    try {
                        const u = new URL(dest);
                        const f = u.searchParams.get("form");
                        if (f) form = f;
                        query = u.searchParams.get("q") || u.searchParams.get("query") || "";
                    } catch (_) {
                        const m = dest.match(/[?&]q=([^&]+)/i);
                        if (m) query = decodeURIComponent(m[1]);
                        const fm = dest.match(/[?&]form=([^&]+)/i);
                        if (fm) form = fm[1];
                    }
                    if (!query) {
                        // 卡片 destination 不带搜索词时，用卡片标题当搜索词（服务端只校验"发生了应用内搜索"）
                        query = String(card.title || "Microsoft Rewards").replace(/[+＋]\s*\d+\s*积分?/g, "").trim() || "Microsoft Rewards";
                    }
                    // 还原真实页面行为：导航到卡片 destination 的完整地址（保留全部查询串），
                    // 锁区时把域名换成当前生效的 host，避免 www.bing.com 302 掉参数
                    let rawUrl = "";
                    try {
                        const u2 = new URL(dest);
                        u2.protocol = "https:";
                        u2.host = RewardsAuto.state.host;
                        if (!u2.searchParams.get("q") && !u2.searchParams.get("query")) u2.searchParams.set("q", query);
                        rawUrl = u2.toString();
                    } catch (_) { rawUrl = ""; }
                    Utils.log("📱", `「${card.title || card.offerId}」按移动端身份搜索：${query}（form=${form}）`);
                    const html = await API.getSearchPage(query, true, form, rawUrl);
                    const pageOk = /b_results|b_algo/i.test(String(html || ""));
                    if (!pageOk) {
                        Utils.log("🟡", `移动端搜索页无结果结构，跳过该卡：${card.title || card.offerId}`);
                    } else {
                        const accepted = await API.reportSearch(html, query, true, form, rawUrl);
                        if (accepted) return await this.settleCard(card, "移动端搜索上报", startedAt);
                        Utils.log("🟡", `移动端搜索上报未被受理：${card.title || card.offerId}`);
                    }
                } catch (e) {
                    Utils.debug("card-app-search", `${card.offerId} 失败: ${e && e.message ? e.message : e}`);
                    Utils.log("🟡", `移动端搜索失败（将回退其它策略）：${e && e.message ? e.message : e}`);
                }
            }

            // 策略 0: DAPI 后台接口（与必应 App 同源，最可靠）
            if (card.offerId) {
                const region = GM_getValue("Config.lock", true) ? "cn" : (RewardsAuto.state.region || "cn").toLowerCase();
                try {
                    const res = await this.withTokenRetry(token => Utils.xhr({
                        method: "POST",
                        url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                        headers: {
                            ...API.dapiHeaders(token, region, true)
                        },
                        data: JSON.stringify({
                            amount: 1,
                            country: region,
                            id: Utils.getRandomUUID().replace(/-/g, "").toLowerCase(),
                            type: 101,
                            channel: RewardsAuto.appConfig.channel,
                            attributes: { offerid: card.offerId }
                        })
                    }));
                    if (Utils.isJSON(res)) {
                        const data = JSON.parse(res);
                        const points = Number(data.response?.activity?.p || 0);
                        const dup = Boolean(data.response?.isDuplicate);
                        if (points > 0 || dup) {
                            Utils.log("🟢", `DAPI领取成功(${card.offerId}) ${points > 0 ? `+${points}积分` : "已重复"}`);
                            return true;
                        }
                    }
                } catch (_) {}
            }

            // 策略 1: Next.js Server Action（需动态 action id + 路由树 + 部署ID）
            try {
                const earnHtml = await this.getEarnHtml();
                const actions = await this.resolveServerActions(earnHtml);
                const nextAction = actions.reportActivity;
                const deployMatch = (earnHtml || "").match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/) || (earnHtml || "").match(/"buildId":"([A-Za-z0-9._-]+)"/);
                const deployId = deployMatch ? deployMatch[1] : "";
                if (nextAction) {
                    // 构造与 earn 页面一致的路由树
                    const tree = ["", { children: ["(nav)", { children: ["earn", { children: ["PAGE", {}, null, null, 4096] }, null, null, 4096] }, null, null, 4096] }, null, null, 4096 + 16];
                    const res = await Utils.xhr({
                        method: "POST", url,
                        headers: {
                            "accept": "text/x-component",
                            "content-type": "text/plain;charset=UTF-8",
                            "next-action": nextAction,
                            "next-router-state-tree": encodeURIComponent(JSON.stringify(tree)),
                            "referer": referer,
                            "origin": "https://rewards.bing.com",
                            ...(deployId ? { "x-deployment-id": deployId } : {})
                        },
                        data: JSON.stringify([card.hash, 11, { offerid: card.offerId, isPromotional: "$undefined", timezoneOffset: String(new Date().getTimezoneOffset()) }])
                    });
                    // 成功判定：RSC 响应中形如 "0:true" 的行（依据开源实现）
                    if (res && /^\d+:true\s*$/m.test(res)) {
                        Utils.log("🟢", `Server Action 领取成功(${card.offerId})`);
                        return true;
                    }
                }
            } catch (e2) {
                if (e2.message === "RUN_LOCK_LOST") throw e2;
                if (e2.message.includes("404")) {
                    Utils.log("🟡", "Server Action ID 可能已更新，下次运行将重新探测");
                    RewardsAuto._serverActions = null;
                    GM_setValue("Config.serverActions", null);
                }
            }

            // 策略 2: 目标链接如果是搜索页，模拟执行每日活动上报
            if (card.destination && card.destination.startsWith("http")) {
                const startedAt = Date.now();
                try {
                    const ok = await this.reportDailyActivity(card.destination);
                    if (ok) return await this.settleCard(card, "链接访问上报", startedAt);
                } catch (_) {}
            }

            // 策略 3（老版 /api/reportactivity）已于 2026-11 站点下线（返回 404），此处已移除，避免假成功
            Utils.log("🟡", `卡片领取未确认(${card.offerId})`);
            return false;
        },

        /**
         * 拉取 dashboard 数据（带 5 分钟缓存），用于上报后的完成状态复核
         * @param {boolean} force 是否强制刷新
         * @returns {Promise<Object|null>} dashboard 对象，失败返回 null
         */
        async fetchDashboardCached(force = false) {
            const now = Date.now();
            if (!force && this._dashboardCache && now - this._dashboardCache.at < 5 * 60 * 1000) {
                return this._dashboardCache.data;
            }
            try {
                // 旧 /api/getuserinfo 已失效（401），改用 DAPI（options=511）的 promotions 作为完成状态来源
                const overview = await this.getDAPIOverview();
                if (!overview) return null;
                const data = { promotions: overview.promotions, balance: overview.balance };
                this._dashboardCache = { at: now, data };
                return data;
            } catch (e) {
                Utils.debug("dashboard", `完成状态回查失败: ${e.message}`);
                return null;
            }
        },

        /**
         * 回查单个卡片是否真的完成（完成为 true，未完成 false，无法查询返回 null）
         * @param {string} offerId 卡片 offerId
         * @param {number} notBefore 缓存必须晚于该时间戳（通常传上报开始时间）
         * @returns {Promise<boolean|null>} 完成状态
         */
        async verifyCardCompleted(offerId, notBefore = 0) {
            if (!offerId) return null;
            // 不再为每张卡片强制刷新 dashboard：5 分钟缓存足够，避免 N 次请求
            const dashboard = await this.fetchDashboardCached(false);
            if (!dashboard) return null;

            const promotions = Array.isArray(dashboard.promotions) ? dashboard.promotions : [];
            // offerId 可能带 _Default 后缀，做双向归一化匹配
            const base = String(offerId).replace(/_Default$/i, "");
            const hit = promotions.find(x => x && (
                x.offerId === offerId ||
                x.offerId === base ||
                String(x.offerId || "").replace(/_Default$/i, "") === base
            ));
            if (!hit) return null;
            if (hit.complete === true) return true;
            if (hit.max > 0 && hit.progress >= hit.max) return true;
            return false;
        },

        /**
         * 卡片上报后的结果复核：区分“已计分”“仅受理未计分”“无法回查”，日志合并标题与 offerId
         * @param {Object} card 卡片对象
         * @param {string} how 上报方式（用于日志）
         * @param {number} startedAt 上报开始时间戳，用于判断回查数据是否新鲜
         * @returns {Promise<boolean>} 确认完成或无法回查时视为成功
         */
        async settleCard(card, how, startedAt = 0) {
            const label = `${card.title || "未命名任务"}（${card.offerId}）`;
            const done = await this.verifyCardCompleted(card.offerId, startedAt);
            if (done === true) {
                Utils.log("✅", `${label} 已计分 · ${how}`);
                return true;
            }
            if (done === false) {
                // 缓存可能尚未反映刚上报的结果：本轮按“已受理”继续，
                // 但记录待确认，避免把当天活动提前标记为完成
                if (card.offerId) RewardsAuto.unconfirmedOfferIds.add(card.offerId);
                Utils.log("🟢", `${label} 已上报（回查暂未确认） · ${how}`);
                return true;
            }
            Utils.log("🟢", `${label} 已上报（暂无法回查状态） · ${how}`);
            return true;
        },

        /**
         * 打开一次搜索页
         * @param {string} query 搜索词
         * @param {boolean} isMobile 是否使用移动端 UA 与 _Rwho=u=m
         * @param {string} form Bing 的 form 参数（默认 QBLH；应用卡传 ML2W4J / ML2Y2H）
         * @returns {Promise<string>} 页面 HTML
         */
        async getSearchPage(query, isMobile = false, form = "", rawUrl = "") {
            const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
            const formParam = String(form || "QBLH");
            const rawCookie = await Utils.getCookieString(`https://${RewardsAuto.state.host}/`);
            // 注入浏览器真实会话 Cookie，避免后台请求被视为未登录而不计分；
            // 移动端再追加 _Rwho=u=m，让服务端把这次搜索算到手机端
            const cookie = Utils.cookieWithRwho(rawCookie, isMobile ? "m" : "d");
            // rawUrl：卡片 destination 的原始搜索地址（带完整查询串），
            // 真实页面就是导航到这个地址后自己调 sj_rra 上报的，参数一个都不能丢
            const pageUrl = rawUrl || `https://${RewardsAuto.state.host}/search?q=${encodeURIComponent(query)}&form=${encodeURIComponent(formParam)}${mkt}`;
            const html = await Utils.xhr({
                url: pageUrl,
                headers: {
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    "referer": `https://${RewardsAuto.state.host}/?form=${encodeURIComponent(formParam)}`,
                    ...(cookie ? { "cookie": cookie } : {})
                }
            });
            const text = typeof html === "string" ? html : "";
            Utils.debug("search-page", `${isMobile ? "移动端" : "PC"} form=${formParam} len=${text.length} IID=${Utils.extractIID(text)} IG=${Utils.extractIG(text) || "无"} 结果=${/b_results|b_algo/i.test(text)}`);
            return html;
        },

        /**
         * 上报一次搜索行为（ncheader + reportActivity）
         * @param {string} html 搜索页 HTML（用于提取 IG）
         * @param {string} query 搜索词
         * @param {boolean} isMobile 是否使用移动端 UA 与 _Rwho=u=m
         * @param {string} form Bing 的 form 参数（默认 QBLH）
         * @returns {Promise<boolean>} 是否被服务端受理（未登录返回 false）
         */
        async reportSearch(html, query, isMobile = false, form = "", rawUrl = "") {
            try {
                // IG 优先取自搜索页（随机 UUID 不会挂到当前会话上，计数不涨）
                const ig = Utils.extractIG(html) || Utils.getRandomUUID();
                // IID 必须用页面自己的（真实 sj_rra 用的是 window.data_iid，如 SERP.5057），
                // 硬编码 SERP.5047 会让这次上报挂到别的页面模块上
                const iid = Utils.extractIID(html);
                const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
                const formParam = String(form || "QBLH");
                const pageUrl = rawUrl || `https://${RewardsAuto.state.host}/search?q=${encodeURIComponent(query)}&form=${encodeURIComponent(formParam)}${mkt}`;
                // 查询串照搬真实页面：sj_rra 取的是 location.search 原文（含 q / form 以及站点附加参数）
                let params = `q=${encodeURIComponent(query)}&form=${encodeURIComponent(formParam)}${mkt}`;
                try {
                    const qs = new URL(pageUrl).search.replace(/^\?/, "");
                    if (qs) params = qs;
                } catch (_) { /* 地址不合法时保留默认查询串 */ }
                const rawCookie = await Utils.getCookieString(`https://${RewardsAuto.state.host}/`);
                // 注入浏览器真实会话 Cookie，确保上报请求被识别为已登录
                const cookie = Utils.cookieWithRwho(rawCookie, isMobile ? "m" : "d");
                const headers = {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    "referer": `https://${RewardsAuto.state.host}/?form=${encodeURIComponent(formParam)}`,
                    ...(cookie ? { "cookie": cookie } : {})
                };
                const headerRes = await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/ncheader?ver=88888888&IID=${encodeURIComponent(iid)}&IG=${ig}&ajaxreq=1`,
                    headers, data: "wb=1%3bi%3d1%3bv%3d1"
                });
                Utils.debug("search-header", `响应: ${String(headerRes).slice(0, 400)}`);
                // 真实 sj_rra 的 body 用 escape() 编码：escape 只放过 @*_+-./ ，冒号仍转成 %3A，
                // 反斜杠前的 "/" 不转义，这里按同样形态拼，避免服务端校验不一致
                const escapedPageUrl = encodeURIComponent(pageUrl).replace(/%2F/gi, "/");
                const actRes = await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/reportActivity?IG=${ig}&IID=${encodeURIComponent(iid)}&${params}&ajaxreq=1`,
                    headers,
                    data: `url=${escapedPageUrl}&V=web`
                });
                Utils.debug("search-report", `响应: ${String(actRes).slice(0, 800)}`);
                // 移动端上报单独留一行回执：这两张卡是否记账只能靠服务端这两个字段判断
                if (isMobile) {
                    const authM = String(actRes).match(/IsAuthenticated"?\s*:\s*(true|false)/i);
                    const incM = String(actRes).match(/RewardsIncrement"?\s*:\s*(\d+)/i);
                    Utils.log("📱", `上报回执: IsAuthenticated=${authM ? authM[1] : "无"} RewardsIncrement=${incM ? incM[1] : "无"}`);
                }
                // 未登录时接口返回页面模块并带 IsAuthenticated:false，此时搜索不会计分
                if (/IsAuthenticated"?\s*:\s*false/i.test(String(actRes))) {
                    // 这里才是真正的会话未登录：搜索不会计分，后续阅读任务也应跳过
                    RewardsAuto.state.pc401 = true;
                    Utils.notifyError("loginExpired", "网页会话未登录（IsAuthenticated:false），搜索不会计分，请在 cn.bing.com 右上角重新登录");
                    return false;
                }
                return true;
            } catch (e) {
                Utils.log("🟡", `搜索上报失败: ${e.message}`);
                return false;
            }
        },

        /**
         * 等待网络就绪（锁屏休眠 / service worker 冷启动后首次请求极易超时）
         * 说明：唤醒瞬间浏览器网络栈尚未恢复，固定 15 秒超时会导致首轮任务全部判失败，
         *      这里先用加长超时探测首页，未通过则退避重试，避免把环境问题误判为任务失败。
         * @param {number} maxWaitMs 最长等待时间（毫秒），默认 120 秒
         * @returns {Promise<boolean>} 就绪返回 true，超过等待上限返回 false
         */
        async waitNetworkReady(maxWaitMs = 120000) {
            const deadline = Date.now() + maxWaitMs;
            // 锁区时直接探测 cn.bing.com，避免 www.bing.com 302 重定向被误判为无响应
            const probeHost = GM_getValue("Config.lock", true) ? "cn.bing.com" : RewardsAuto.state.host;
            let attempt = 0;
            while (Date.now() < deadline) {
                attempt++;
                try {
                    const html = await Utils.xhr({
                        url: `https://${probeHost}/`,
                        timeout: 30000
                    });
                    if (html && html.length > 200) {
                        if (attempt > 1) Utils.log("🟢", `网络已就绪（第 ${attempt} 次探测）`);
                        return true;
                    }
                    Utils.log("🟡", `网络探测无有效响应（第 ${attempt} 次）`);
                } catch (e) {
                    Utils.log("🟡", `网络未就绪（第 ${attempt} 次探测）: ${e.message}`);
                }
                // 退避：5 秒起步，最长 15 秒，避免唤醒瞬间高频打请求
                await Utils.delay(Math.min(15000, 5000 * attempt));
            }
            return false;
        },

        async checkRegion(retryCount = 0) {
            if (!GM_getValue("Config.lock", true)) return true;
            try {
                const html = await Utils.xhr({ url: `https://${RewardsAuto.state.host}/` });
                if (!html) {
                    if (retryCount < 2) {
                        Utils.log("🟡", `地区检测返回空，第${retryCount + 1}次重试...`);
                        await Utils.randomDelay(3000, 8000);
                        return await this.checkRegion(retryCount + 1);
                    }
                    Utils.log("🔴", "地区检测失败（无响应）");
                    return false;
                }
                const match = html.replace(/\s/g, "").match(/Region:"(.*?)"(.*?)RevIpCC:"(.*?)"/);
                if (match) {
                    RewardsAuto.state.region = match[3].toUpperCase();
                    if (RewardsAuto.state.region !== "CN") {
                        await this.getIPInfo();
                        Utils.log("🔴", `IP非大陆(${RewardsAuto.state.region})，已停止\n${RewardsAuto.state.ipInfo}`);
                        return false;
                    }
                    Utils.log("🟢", `地区检测通过: ${RewardsAuto.state.region}`);
                    // 锁区为 CN 时统一走 cn.bing.com，避免 www.bing.com 302 重定向导致 POST 上报体丢失
                    RewardsAuto.state.host = "cn.bing.com";
                    return true;
                }
                if (retryCount < 2) {
                    Utils.log("🟡", `地区检测格式异常，第${retryCount + 1}次重试...`);
                    await Utils.randomDelay(3000, 8000);
                    return await this.checkRegion(retryCount + 1);
                }
                Utils.log("🔴", "地区检测失败（格式不匹配）");
                return false;
            } catch (e) {
                if (retryCount < 2) {
                    Utils.log("🟡", `地区检测异常: ${e.message}，第${retryCount + 1}次重试...`);
                    await Utils.randomDelay(3000, 8000);
                    return await this.checkRegion(retryCount + 1);
                }
                Utils.log("🔴", `地区检测失败: ${e.message}`);
                return false;
            }
        },

        async getIPInfo() {
            try {
                const qryResult = await Utils.xhr({
                    url: "https://disp-qryapi.3g.qq.com/v1/dispatch",
                    headers: { "referer": "https://3g.qq.com/" }
                });
                if (qryResult && Utils.isJSON(qryResult)) {
                    const resJSON = JSON.parse(qryResult);
                    RewardsAuto.state.ip = (resJSON.code == 0 && resJSON.extra && resJSON.extra.ip) ? resJSON.extra.ip : "";
                    let rawInfo = (resJSON.code == 0 && resJSON.ipInfo) ? String(resJSON.ipInfo) : "";
                    rawInfo = rawInfo.replace(/[#*]+/g, " ").trim();
                    RewardsAuto.state.ipInfo = rawInfo ? `🌏所在地区：${rawInfo}` : "";
                }
            } catch (e) {
                // 附加 IP 信息仅用于展示，失败不影响任务，记录到调试缓冲而不污染用户日志
                Utils.debug("ip", `获取附加 IP 信息失败: ${e.message}`);
            }
        },

        async getHotSearchWord() {
            const keywords = ["天气预报", "今日新闻", "体育赛事", "股票行情", "电影推荐", "科技资讯", "美食食谱", "旅游攻略", "历史上的今天", "健康常识"];
            const baseWord = keywords[Utils.randomRange(0, keywords.length - 1)];
            const randomSuffix = Math.random().toString(36).slice(2, 6);
            let sentence = `${baseWord} ${randomSuffix}`;
            if (RewardsAuto.apiConfig.mode !== "offline") {
                if (RewardsAuto.apiConfig.wordIndex < 1 || RewardsAuto.apiConfig.wordList.length < 1) {
                    const apiArr = RewardsAuto.apiConfig.arr;
                    const lastApiIndex = parseInt(GM_getValue("Config.apiIndex", -1));
                    const filteredArr = apiArr.filter((_, index) => index !== lastApiIndex);
                    const randomIndex = Utils.randomRange(0, filteredArr.length - 1);
                    GM_setValue("Config.apiIndex", randomIndex);
                    const [apiName, apiConfig] = filteredArr[randomIndex];
                    RewardsAuto.apiConfig.url = apiConfig.url;
                    RewardsAuto.apiConfig.hot = apiConfig.hot;
                    try {
                        const hotSource = RewardsAuto.apiConfig.hot[Utils.randomRange(0, RewardsAuto.apiConfig.hot.length - 1)];
                        const result = await Utils.xhr({ url: RewardsAuto.apiConfig.url + hotSource });
                        if (result && Utils.isJSON(result)) {
                            const res = JSON.parse(result);
                            if (res.code == 200) {
                                RewardsAuto.apiConfig.wordIndex = 1;
                                RewardsAuto.apiConfig.wordList = [];
                                for (let i = 0; i < res.data.length; i++) {
                                    RewardsAuto.apiConfig.wordList.push(res.data[i].title);
                                }
                                RewardsAuto.apiConfig.wordList.sort(() => Math.random() - 0.5);
                                sentence = RewardsAuto.apiConfig.wordList[RewardsAuto.apiConfig.wordIndex];
                                sentence = sentence.substring(0, Utils.randomRange(20, 32));
                                return sentence;
                            }
                        }
                    } catch (e) {
                        Utils.log("🟡", `热搜词获取失败: ${e.message}`);
                    }
                } else {
                    RewardsAuto.apiConfig.wordIndex++;
                    if (RewardsAuto.apiConfig.wordIndex > RewardsAuto.apiConfig.wordList.length - 1) {
                        RewardsAuto.apiConfig.wordIndex = 0;
                    }
                    sentence = RewardsAuto.apiConfig.wordList[RewardsAuto.apiConfig.wordIndex];
                    sentence = sentence.substring(0, Utils.randomRange(20, 32));
                    return sentence;
                }
                Utils.log("🟡", "热搜词接口异常，已使用随机搜索词");
            }
            return sentence;
        },

        async checkSearchRestricted(info = null) {
            const data = info || await this.getRewardsInfo();
            const currentTotal = data ? data.pc.progress : RewardsAuto.state.pcProgress;
            const lastTotal = RewardsAuto.state.lastSearchProgress;
            if (lastTotal !== -1) {
                if (currentTotal === lastTotal && currentTotal < RewardsAuto.state.pcMax) {
                    RewardsAuto.state.restrictedTimes++;
                } else {
                    RewardsAuto.state.restrictedTimes = 0;
                }
            }
            RewardsAuto.state.lastSearchProgress = currentTotal;
            GM_setValue("Config.lastSearchProgress", currentTotal);
            GM_setValue("Config.restrictedTimes", RewardsAuto.state.restrictedTimes);
            if (RewardsAuto.state.restrictedTimes >= 8) {
                Utils.notifyError("searchRestricted", `连续 ${RewardsAuto.state.restrictedTimes} 轮搜索进度未增长（PC ${currentTotal}/${RewardsAuto.state.pcMax}），本轮暂停，后续继续尝试`);
                // 清零计数，避免一整天被永久判定为受限而不再搜索
                RewardsAuto.state.restrictedTimes = 0;
                GM_setValue("Config.restrictedTimes", 0);
                return true;
            }
            return false;
        }
    };

    const TaskManager = {
        signDate: 0, readDate: 0, promosDate: 0, searchDate: 0, dailySetDate: 0, streakDays: 0,
        signPoint: -1, signTimes: 0, readTimes: 0, promosTimes: 0,
        signAppPoint: -1, signPCPoint: -1, promoStats: { ok: 0, fail: 0 }, dailySetStats: { ok: 0, fail: 0 },
        // 运行锁：内存态在 service worker 被回收后不可靠，故持久化到 GM 存储防止新旧两轮并发
        runId: null,
        sleepMs: 0,
        running: false,
        /**
         * 运行锁心跳超时阈值：超过该时长未刷新，视为旧轮已被浏览器回收或卡死
         * @type {number}
         */
        RUN_LOCK_TTL_MS: 10 * 60 * 1000,
        /**
         * 休眠判定阈值：两次心跳间隔超过该时长，说明发生了锁屏休眠，计入本轮休眠时长
         * @type {number}
         */
        SLEEP_GAP_MS: 5 * 60 * 1000,

        /**
         * 读取持久化的运行锁
         * @returns {{id:string,startAt:number,heartbeatAt:number}|null} 锁信息，无锁返回 null
         */
        readRunLock() {
            const lock = GM_getValue("Config.runLock", null);
            if (!lock || typeof lock !== "object" || !lock.id) return null;
            return lock;
        },

        /**
         * 抢占本轮运行锁：心跳未超时说明另有轮次在跑，本次跳过
         * @returns {boolean} true 表示成功占用本轮
         */
        claimRunLock() {
            const now = Utils.getTimestamp();
            const lock = this.readRunLock();
            if (lock && now - Number(lock.heartbeatAt || 0) < this.RUN_LOCK_TTL_MS) return false;
            this.runId = Utils.getRandomUUID();
            this.sleepMs = 0;
            GM_setValue("Config.runLock", { id: this.runId, startAt: now, heartbeatAt: now });
            return true;
        },

        /**
         * 刷新运行锁心跳，并累计休眠/回收造成的空档时间
         * @returns {boolean} false 表示锁已被其它轮次接管，应终止本轮
         */
        touchRunLock() {
            const now = Utils.getTimestamp();
            const lock = this.readRunLock();
            if (lock && lock.id !== this.runId) return false;
            const gap = lock ? now - Number(lock.heartbeatAt || now) : 0;
            // 长时间无心跳 = 浏览器休眠/回收，累计后从总耗时中扣除
            if (gap > this.SLEEP_GAP_MS) this.sleepMs += gap;
            GM_setValue("Config.runLock", {
                id: this.runId,
                startAt: lock ? Number(lock.startAt) : now,
                heartbeatAt: now
            });
            return true;
        },

        /**
         * 释放运行锁（仅释放本轮持有的锁，避免误删其它轮次的锁）
         */
        releaseRunLock() {
            const lock = this.readRunLock();
            if (lock && lock.id === this.runId) GM_setValue("Config.runLock", null);
            this.runId = null;
        },

        // v1.8.0：已彻底移除「连续 N 天全部完成后次日跳过」的跨日调度逻辑；脚本每天固定运行，
        // 只要当天有未完成项就继续补做，唯一的“跳过”是同轮并发保护（运行锁）。

        init() {
            RewardsAuto.state.dateNowNum = Utils.getTodayNum();
            RewardsAuto.state.dateNowStr = Utils.getTodayStr();
            const today = RewardsAuto.state.dateNowNum;
            // 跨日重置内存中的尝试次数，避免昨天的失败次数把今天卡住
            if (GM_getValue("Config.attemptDay", 0) !== today) {
                this.signTimes = 0;
                this.readTimes = 0;
                this.promosTimes = 0;
                GM_setValue("Config.attemptDay", today);
            }
            const tasks = GM_getValue("Config.tasks", {});
            this.signDate = tasks.sign || 0;
            this.readDate = tasks.read || 0;
            this.promosDate = tasks.promos || 0;
            this.searchDate = tasks.search || 0;
            this.dailySetDate = tasks.dailySet || 0;
            this.streakDays = tasks.streakDays || 0;
            // 版本升级时清掉旧版本可能误写的“今日已完成”标记，
            // 否则新版本当天会直接跳过活动/日常任务（v1.3.1/v1.3.2 都有这类残留）。
            // v1.6.0 更换了数据源（dashboard RSC + DAPI 字段适配），升级时重置一次当日尝试状态
            // v1.8.2 调整了活动卡片/每日活动的尝试计数语义，升版时再重置一次旧尝试态
            // v1.8.3 放开了 App 内搜索卡拦截，升版时重置一次，让此前被跳过的卡当天就能重试
            // v1.8.4 补齐了应用内搜索上报的参数（原始 destination + 页面 IID + escape 编码的 url），
            //        同样重置一次，让当天被旧逻辑标记过的卡再试一遍
            // v1.8.5 只做排障增强（保留服务端响应体 / 连接层详情 / 连续失败熔断），业务语义未变；
            //        这里的重置只清「当日尝试计数」，不含「已完成」标记，重复执行无副作用
            // v1.8.6 是纯代码整理（删死代码 / 合并重复解析与请求头），不改任何业务判定；
            // v2.0.0 移除了桌面应用周任务（服务端不认网页身份交卷）与面板死代码，
            //        业务判定同样未变，沿用同一重置逻辑，重复执行无副作用
            const engineVersion = "2.0.0";
            if (GM_getValue("Config.engineVersion", "") !== engineVersion) {
                this.promosDate = 0;
                this.dailySetDate = 0;
                GM_setValue("Config.promosAttemptState", { date: 0, count: 0 });
                GM_setValue("Config.dailySetAttemptState", { date: 0, count: 0 });
                GM_setValue("Config.engineVersion", engineVersion);
                this.save();
            }
            this.signPoint = GM_getValue("Config.signPoint", -1);
            this.signAppPoint = -1;
            this.signPCPoint = -1;
            // 恢复当日已记录的 PC / APP 签到明细（用于汇总推送分列展示）
            const signDetail = GM_getValue("Config.signDetail", {});
            if (signDetail && signDetail.date === RewardsAuto.state.dateNowNum) {
                this.signAppPoint = Number(signDetail.app ?? -1);
                this.signPCPoint = Number(signDetail.pc ?? -1);
            }
            this.promoStats = { ok: 0, fail: 0 };
            this.dailySetStats = { ok: 0, fail: 0 };
            RewardsAuto.claimedOfferIds.clear();
            RewardsAuto.unconfirmedOfferIds.clear();
            // 新一轮强制刷新本轮缓存，避免复用上一轮/预检前的旧数据
            Utils.cacheClear();
        },

        /**
         * 启动间隔自检（借鉴上游 1.4.x 的 checkStartupGap）
         * 定时脚本被宿主跳过、扩展被禁用、浏览器长期未开时，脚本根本跑不起来，
         * 也就没机会推送任何东西。这里在下次成功启动时补一条告警，
         * 让"其实好几天没跑"这件事能被看见，而不是等用户自己发现积分不涨。
         * 时间戳写在 runAll 真正开始执行处，避免"初始化了但没跑"掩盖问题。
         * @returns {void}
         */
        checkStartupGap() {
            const last = Number(GM_getValue("Config.lastRunTs", 0)) || 0;
            if (!last) return;
            const gapH = (Date.now() - last) / 3600000;
            if (gapH < 12) return;
            const pad = (n) => String(n).padStart(2, "0");
            const when = new Date(last);
            const stamp = `${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
            Utils.notifyError("startupGap", `脚本已 ${gapH.toFixed(1)} 小时未成功运行（上次 ${stamp}）。常见原因：定时被宿主跳过、扩展被禁用、浏览器未开启。`);
        },

        save() {
            GM_setValue("Config.tasks", {
                sign: this.signDate, read: this.readDate,
                promos: this.promosDate, search: this.searchDate,
                dailySet: this.dailySetDate,
                streakDays: this.streakDays
            });
        },

        async doSign() {
            if (!GM_getValue("Tasks.sign", true) || this.signTimes > 2) return;
            // 先查服务端签到状态：已经完成的签到不再重复请求
            const serverSign = await API.getSignStatus();
            if (serverSign) {
                if (serverSign.app && this.signAppPoint < 0) this.signAppPoint = 0;
                if (serverSign.pc && this.signPCPoint < 0) this.signPCPoint = 0;
                if (serverSign.app && serverSign.pc) {
                    this.signDate = RewardsAuto.state.dateNowNum;
                    this.save();
                    GM_log("✅ PC/APP 签到均已由服务端确认，跳过重复签入");
                    return;
                }
                GM_log(`ℹ️ 服务端签到状态: PC ${serverSign.pc ? "已签" : "未签"} / APP ${serverSign.app ? "已签" : "未签"}`);
            }
            // 只有 PC 与 APP 都确认成功才跳过，否则继续补签（避免首轮 PC 失败后当天不再尝试）
            if (this.signDate === RewardsAuto.state.dateNowNum && this.signAppPoint >= 0 && this.signPCPoint >= 0) {
                GM_log(`✅ 签入已完成（PC +${this.signPCPoint} / APP +${this.signAppPoint}）`);
                return;
            }
            await Utils.randomDelay();
            let totalPoint = 0;
            let signOk = false;
            if (this.signAppPoint >= 0) {
                // APP 已签到，无需重复请求
                signOk = true;
            } else {
                const appPoint = await API.signApp();
                this.signAppPoint = appPoint;
                if (appPoint >= 0) {
                    signOk = true;
                    if (appPoint > 0) {
                        GM_log(`📱 App签入静默成功 +${appPoint}积分`);
                        totalPoint += appPoint;
                    } else {
                        GM_log("📱 App签入已确认，无新增积分");
                    }
                }
            }
            await Utils.randomDelay(3000, 8000);
            if (this.signPCPoint >= 0) {
                // PC 已签到，无需重复请求
                signOk = true;
            } else {
                const pcPoint = await API.signPC();
                this.signPCPoint = pcPoint;
                if (pcPoint >= 0) {
                    signOk = true;
                    GM_log(`💻 PC签入成功！+${pcPoint}积分`);
                    totalPoint += pcPoint;
                }
            }
            if (signOk) {
                this.signPoint = totalPoint;
                this.signDate = RewardsAuto.state.dateNowNum;
                GM_setValue("Config.signPoint", totalPoint);
                GM_setValue("Config.signDetail", {
                    date: RewardsAuto.state.dateNowNum,
                    app: this.signAppPoint,
                    pc: this.signPCPoint
                });
                this.save();
                GM_log(`🔵 签入任务完成！PC ${this.signPCPoint >= 0 ? "+" + this.signPCPoint : "失败"} / APP ${this.signAppPoint >= 0 ? "+" + this.signAppPoint : "失败"}`);
            } else {
                this.signTimes++;
                Utils.log("🟡", `签入未完成（PC ${this.signPCPoint >= 0 ? "已签" : "失败"} / APP ${this.signAppPoint >= 0 ? "已签" : "失败"}），稍后重试`);
            }
        },

        /**
         * 复核 PC 签到状态
         * 背景：reportactivity 上报可能被拒（401/超时），但搜索行为本身会触发服务端签到计数器，
         *      因此上报失败后不以接口返回值为准，改用 DAPI 计数器二次确认，确认后按已签处理。
         * @returns {Promise<boolean>} 服务端确认已签返回 true
         */
        async recheckPCSign() {
            if (this.signPCPoint >= 0) return true;
            const serverSign = await API.getSignStatus();
            if (!serverSign || !serverSign.pc) return false;
            this.signPCPoint = 0;
            this.signDate = RewardsAuto.state.dateNowNum;
            // 仅补齐 PC 字段，保留 doSign 记录的 APP 积分
            GM_setValue("Config.signDetail", {
                date: RewardsAuto.state.dateNowNum,
                app: this.signAppPoint,
                pc: this.signPCPoint
            });
            this.save();
            Utils.log("✅", "PC签到已由服务端计数器确认（搜索行为已完成签到）");
            return true;
        },

        async doRead() {
            if (!GM_getValue("Tasks.read", true) || this.readTimes > 2) return;
            if (this.readDate === RewardsAuto.state.dateNowNum) {
                const verifyProgress = await API.getReadProgress();
                if (verifyProgress && verifyProgress.progress >= verifyProgress.max) {
                    Utils.log("✅", `阅读任务已完成（已验证 ${verifyProgress.progress}/${verifyProgress.max}）`);
                    return;
                } else if (verifyProgress) {
                    Utils.log("🟡", `阅读标记有误（${verifyProgress.progress}/${verifyProgress.max}），重置并继续`);
                    this.readDate = 0;
                    this.save();
                } else {
                    Utils.log("🟡", "无法验证阅读进度，跳过");
                    return;
                }
            }
            const progress = await API.getReadProgress();
            if (!progress) {
                this.readTimes++;
                Utils.log("🟡", "无法获取阅读进度，稍后重试");
                return;
            }
            const { progress: cur, max } = progress;
            Utils.log("📖", `阅读进度: ${cur}/${max}`);
            if (cur >= max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                this.save();
                Utils.log("✅", "阅读任务已完成");
                return;
            }
            let successCount = 0;
            let gained = 0;
            let current = cur;
            const maxPerDay = 10;
            Utils.log("📖", `阅读进度 ${cur}/${max}，本轮最多 ${maxPerDay} 篇`);
            for (let i = 0; i < maxPerDay && current < max; i++) {
                // 阅读耗时较长，逐篇刷新锁心跳，避免长时间无心跳被判为旧轮
                if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                const result = await API.doRead(progress.offerId);
                if (!result) { Utils.log("🟡", `阅读第 ${i + 1} 篇失败，中止`); break; }
                const points = Number(result.points) || 0;
                if (points <= 0) {
                    Utils.log("🟡", `阅读第 ${i + 1} 篇未计分${result.isDuplicate ? "（已读）" : ""}，中止`);
                    break;
                }
                successCount++;
                gained += points;
                current = Math.min(max, current + points);
                Utils.log("📖", `阅读文章 ${i + 1}/${maxPerDay} +${points}积分（${current}/${max}）`);
                if (current >= max) break;
                await Utils.randomDelay(3000, 8000);
            }
            if (successCount === 0) {
                this.readTimes++;
                Utils.log("🟡", "阅读全部失败，稍后重试");
                return;
            }
            const verify = await API.getReadProgress();
            if (verify && verify.progress >= verify.max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                this.save();
                GM_log(`🔵 阅读任务完成！共 ${successCount} 篇 +${gained} 积分`);
            } else {
                this.readTimes++;
                Utils.log("🟡", `阅读已执行但未完成，下次继续`);
            }
        },

        async doPromos() {
            if (!GM_getValue("Tasks.promos", true)) return;
            const today = RewardsAuto.state.dateNowNum;
            const attemptKey = "Config.promosAttemptState";
            let attempt = GM_getValue(attemptKey, { date: 0, count: 0 }) || { date: 0, count: 0 };
            if (attempt.date !== today) attempt = { date: today, count: 0 };
            if (this.promosDate === today || attempt.count >= 3) {
                Utils.log(this.promosDate === today ? "✅" : "🟡",
                    this.promosDate === today ? "活动卡片已完成" : "活动卡片本轮已尝试 3 次，等待下次运行");
                return;
            }
            // v1.8.2：本轮先计数；若本轮成功完成则在末尾清零（失败才累计，上限 3）
            attempt.count++;
            GM_setValue(attemptKey, attempt);
            let ok = 0, fail = 0;
            const unconfirmedBefore = RewardsAuto.unconfirmedOfferIds.size;

            // 第一优先：DAPI 任务列表（最可靠，覆盖日常任务/打卡活动/升级活动卡片）
            const promos = await API.getDAPIPromos();
            const dapiOk = Array.isArray(promos);
            if (dapiOk && promos.length > 0) {
                const claimable = promos.filter(p => {
                    if (p.complete) return false;
                    // 签到/连签由 doSign 处理，DAPI 的 checkin 是终身计数器，容易重复请求
                    if (p.type === "checkin" || p.type === "streak") return false;
                    // 每日任务由 doDailySet/claimCard 用 hash 上报；DAPI 还会带入明日预热项
                    if (/^Gamification_DailySet_/i.test(p.offerId)) return false;
                    if (p.hidden) return false;
                    // 搜索/阅读分别由 doSearch/doRead 处理；信息/抽奖类跳过
                    if (p.type === "search" || p.type === "msnreadearn") return false;
                    if (/sweepstake|refer|抽奖|兑换/i.test(p.title)) return false;
                    return p.type === "urlreward";
                });
                Utils.log("🧩", `DAPI 发现 ${claimable.length} 个可执行任务`);
                for (const p of claimable) {
                    if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                    if (p.type === "msnreadearn") continue; // 阅读任务由 doRead 专门处理
                    Utils.log("  ", `[DAPI:${p.type}] ${p.title} +${p.points}p`);
                    await Utils.randomDelay(3000, 8000);
                    const res = await API.claimDAPI(p.offerId, 101);
                    if (res && (res.points > 0 || res.isDuplicate)) {
                        ok++;
                        Utils.log("🟢", `任务完成: ${p.title} +${res.points}p`);
                    } else {
                        // DAPI 不支持的类型，交由卡片策略处理，不计入失败
                        Utils.debug("promos", `DAPI未直接领取: ${p.offerId}`);
                    }
                }
            }

            // 第二优先：HTML/Flight 发现的卡片（含拼图、quiz 等需人工的类型）
            Utils.log("🧩", "扫描活动卡片...");
            // 跳过启动预检时服务端已完成的卡片，避免重复上报
            const pre = RewardsAuto.precheck;
            const doneIds = new Set(
                (pre && pre.dateNum === RewardsAuto.state.dateNowNum ? pre.completedOfferIds : []) || []
            );
            const cards = (await API.discoverCards()).filter(c => !doneIds.has(c.offerId));
            if (cards.length === 0) {
                Utils.log("✅", "未发现待处理活动卡片");
            } else {
                Utils.log("🧩", `发现 ${cards.length} 个卡片`);
                for (const card of cards) {
                    if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                    Utils.log("  ", `[${RewardsAuto.kindText[card.kind] || card.kind}] ${card.title} +${card.points}p（${card.offerId}）`);
                    if (card.kind === "quiz" && !GM_getValue("Tasks.quiz", true)) continue;
                    await Utils.randomDelay(3000, 8000);
                    const result = await API.claimCard(card);
                    result ? ok++ : fail++;
                }
            }
            this.promoStats = { ok, fail };
            const unconfirmed = RewardsAuto.unconfirmedOfferIds.size - unconfirmedBefore;
            // 只有全部成功、没有待确认项且 DAPI 列表可读时才标记完成；否则下一轮继续补做
            if (fail === 0 && unconfirmed === 0 && dapiOk) {
                this.promosDate = today;
                // v1.8.2：成功即清零尝试计数，避免偶发失败耗尽次数后罢工
                GM_setValue(attemptKey, { date: today, count: 0 });
            }
            this.save();
            GM_log(`🔵 活动完成: ${ok}成功/${fail}失败${unconfirmed > 0 ? `/${unconfirmed}待确认` : ""}`);
        },

        /**
         * 生成分类汇总推送文本（账户 / 任务 / 活动卡片 / 本次执行）
         * @param {Object} stats getServerStats() 返回的服务端统计
         * @param {"half"|"final"} scope 推送类型（half=半程，final=日报）
         * @returns {string} 推送正文
         */
        buildReport(stats, scope) {
            /**
             * 格式化“已完成/总数”，未知时返回占位符
             * @param {{done:number,total:number,known:boolean}} item 统计项
             * @returns {string} 展示文本（含完成标记）
             */
            const fmtGroup = (item) => {
                if (!item.known) return "—";
                const ok = item.total > 0 && item.done >= item.total;
                return `${ok ? "✅" : "⏳"} ${item.done}/${item.total}`;
            };
            /**
             * 完成状态标记
             * @param {boolean} ok 是否完成
             * @returns {string} ✅ 或 ⏳
             */
            const mark = (ok) => ok ? "✅" : "⏳";
            /**
             * 签到状态文本：服务端已签优先，其次看本地执行结果
             * @param {{done:boolean,known:boolean}} server 服务端签到状态
             * @param {number} localPoint 本地执行获得的积分（-1 表示未执行或失败）
             * @returns {string} 展示文本
             */
            const signText = (server, localPoint) => {
                if (server && server.done) return localPoint > 0 ? `✅ +${localPoint}` : "✅";
                if (localPoint >= 0) return localPoint > 0 ? `✅ +${localPoint}` : "✅";
                return server && server.known ? "❌" : "—";
            };
            const signApp = signText(stats.signApp, this.signAppPoint);
            const signPC = signText(stats.signPC, this.signPCPoint);
            /**
             * 进度型统计（阅读/搜索）的紧凑展示
             * @param {{progress:number,max:number,known:boolean}} item 统计项
             * @returns {string} 形如 “✅ 30/30”
             */
            const progressText = (item) => item.known ? `${mark(item.progress >= item.max)} ${item.progress}/${item.max}` : "—";
            // 聊天窗口较窄，按行压缩：每行只放 2 个短字段，整体控制在 7 行内
            const day = Utils.getTodayNum();
            const dateStr = `${Math.floor(day / 100 % 100)}/${day % 100}`;
            const execOk = this.promoStats.ok + this.dailySetStats.ok;
            const execFail = this.promoStats.fail + this.dailySetStats.fail;
            const lines = [
                `${scope === "half" ? "📊 半程" : "📊 日报"} ${dateStr}`,
                `💰 ${stats.balance === null ? "—" : stats.balance} · 今日 ${stats.earnedToday === null ? "—" : `+${stats.earnedToday}`}`,
                `✍️ 签到 PC${signPC} APP${signApp}`,
                `📖 阅读 ${progressText(stats.read)} · 🔍 搜索 ${progressText(stats.search)}`,
                `🎯 日常 ${fmtGroup(stats.dailySet)} · 任务卡 ${fmtGroup(stats.punchcard)}`,
                `🎴 活动 ${fmtGroup(stats.evergreen)} · 打卡 ${stats.checkin.known ? `${stats.checkin.streak}天` : "—"}`,
                `⚡ 成功 ${execOk} · 失败 ${execFail} · 待领 ${stats.claimable > 0 ? `+${stats.claimable}` : "0"} · 需人工 ${RewardsAuto.humanNeeded.size}`
            ];
            return lines.join("\n");
        },

        /**
         * 搜索任务达到 50% 且尚未满额时推送半程汇总（每天最多一次）
         * 说明：进度已满时不再推半程，避免与紧随其后的日报内容完全重复
         * @param {Object} info 含 pc.progress / pc.max 的进度信息
         */
        async notifyHalfIfNeeded(info) {
            if (!info || !info.pc || info.pc.max <= 0) return;
            if (info.pc.progress < info.pc.max * 0.5) return;
            if (info.pc.progress >= info.pc.max) return;
            if (!Utils.markNotify("half")) return;
            const stats = await API.getServerStats();
            Utils.log("📊", this.buildReport(stats, "half"), true);
        },

        async doSearch() {
            if (!GM_getValue("Tasks.search", true)) return;
            const info = await API.getRewardsInfo();
            if (!info) { Utils.log("🔴", "无法获取积分信息"); return; }
            RewardsAuto.state.pcProgress = info.pc.progress;
            RewardsAuto.state.pcMax = info.pc.max;
            let perSearch = Number(info.pc.step) || 0;
            if (!perSearch) perSearch = await API.getSearchStep();
            perSearch = Math.max(1, perSearch);
            Utils.log("🔍", `搜索配额: PC ${info.pc.progress}/${info.pc.max}（每次约 ${perSearch} 分）`);
            // v1.8.3：手机端配额（pointsCounters.mobile）此前只解析不消费，这里一并补跑
            const mob = info.mobile || { progress: 0, max: 0 };
            const mobMax = Number(mob.max) || 0;
            const mobCur = Number(mob.progress) || 0;
            if (mobMax > 0) Utils.log("📱", `搜索配额: 手机 ${mobCur}/${mobMax}`);
            const pcDone = info.pc.progress >= info.pc.max;
            const mobDone = mobMax <= 0 || mobCur >= mobMax;
            if (pcDone && mobDone) {
                this.searchDate = RewardsAuto.state.dateNowNum;
                this.save();
                Utils.log("✅", `搜索配额已满 PC: ${info.pc.progress}/${info.pc.max}${mobMax > 0 ? `，手机: ${mobCur}/${mobMax}` : ""}`);
                return;
            }
            if (this.searchDate === RewardsAuto.state.dateNowNum) {
                Utils.log("🟡", "搜索配额未满，继续执行搜索任务");
                this.searchDate = 0;
            }
            const isRestricted = pcDone ? false : await API.checkSearchRestricted(info);
            if (isRestricted) {
                this.searchDate = RewardsAuto.state.dateNowNum;
                this.save();
                return;
            }
            // 服务端按积分计进度（CN 新体系每次搜索约 3 分），按每次分值折算次数
            const remain = Math.max(0, info.pc.max - info.pc.progress);
            // 单轮上限放宽到 25：60 分配额 / 每次 3 分需要 20 次，旧上限 15 会拆成两轮
            // PC 配额已满时 limit=0，直接跳过 PC 循环、只补手机端
            const limit = pcDone ? 0 : Math.min(25, Math.max(1, Math.ceil(remain / perSearch)));
            const usedQueries = new Set();
            for (let i = 0; i < limit; i++) {
                if (RewardsAuto.state.pcProgress >= RewardsAuto.state.pcMax) break;
                // 搜索循环可持续十几分钟，每轮刷新锁心跳，避免超过锁超时被新轮接管
                if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                let query = "";
                // 同一轮内避免重复搜索词（重复词不计分）
                for (let t = 0; t < 5 && (!query || usedQueries.has(query)); t++) {
                    query = RewardsAuto.apiConfig.mode !== "offline"
                        ? await API.getHotSearchWord()
                        : RewardsAuto.searchPool[Utils.randomRange(0, RewardsAuto.searchPool.length - 1)];
                }
                if (query && !usedQueries.has(query)) {
                    usedQueries.add(query);
                    Utils.log("🔍", `[PC] 搜索 ${i+1}/${limit}: ${query}`);
                    try {
                        const html = await API.getSearchPage(query, false);
                        if (html && /b_results|b_algo/i.test(html)) {
                            const reported = await API.reportSearch(html, query, false);
                            if (reported) {
                                RewardsAuto.state.pcProgress += perSearch;
                                // 达到半程立即推送，不必等整轮结束（否则常常已满额、内容与日报重复）
                                await this.notifyHalfIfNeeded({
                                    pc: { progress: RewardsAuto.state.pcProgress, max: RewardsAuto.state.pcMax }
                                });
                            } else {
                                // 未登录或上报被拒时立即停止本轮，避免无效请求刷屏
                                Utils.log("🟡", `搜索上报未被接受（第 ${i+1}/${limit} 次），本轮提前结束`);
                                break;
                            }
                        } else {
                            Utils.log("🟡", "搜索页无结果内容，本次不计入进度");
                        }
                    } catch (e) {
                        Utils.log("🟡", `搜索失败: ${e.message}`);
                    }
                }
                // 最后一条不需要再等待；已完成配额时也直接结束
                if (i < limit - 1 && RewardsAuto.state.pcProgress < RewardsAuto.state.pcMax) {
                    const span = Number(GM_getValue("Config.span", 30));
                    const wait = Utils.randomRange((span-15)*1000, (span+15)*1000);
                    Utils.log("⏳", `等待 ${wait/1000}秒`);
                    await Utils.delay(wait);
                }
            }
            // 手机端搜索补跑（v1.8.3）：UA 用 mobile、请求头 cookie 追加 _Rwho=u=m，
            // 服务端才会把这次搜索计入 mobile 配额而不是 PC 配额。
            if (mobMax > 0 && mobCur < mobMax) {
                let mobProgress = mobCur;
                const mobRemain = mobMax - mobCur;
                const mobLimit = Math.min(10, Math.max(1, Math.ceil(mobRemain / perSearch)));
                Utils.log("📱", `开始补跑手机端搜索 ${mobCur}/${mobMax}（计划 ${mobLimit} 次）`);
                const mobQueries = new Set();
                for (let i = 0; i < mobLimit; i++) {
                    if (mobProgress >= mobMax) break;
                    if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                    let query = "";
                    for (let t = 0; t < 5 && (!query || mobQueries.has(query)); t++) {
                        query = RewardsAuto.apiConfig.mode !== "offline"
                            ? await API.getHotSearchWord()
                            : RewardsAuto.searchPool[Utils.randomRange(0, RewardsAuto.searchPool.length - 1)];
                    }
                    if (!query || mobQueries.has(query)) continue;
                    mobQueries.add(query);
                    Utils.log("📱", `[手机] 搜索 ${i+1}/${mobLimit}: ${query}`);
                    try {
                        const html = await API.getSearchPage(query, true);
                        if (html && /b_results|b_algo/i.test(html)) {
                            const reported = await API.reportSearch(html, query, true);
                            if (reported) {
                                mobProgress += perSearch;
                            } else {
                                Utils.log("🟡", `手机端搜索上报未被接受（第 ${i+1}/${mobLimit} 次），跳过剩余手机搜索`);
                                break;
                            }
                        } else {
                            Utils.log("🟡", "手机端搜索页无结果内容，本次不计入进度");
                        }
                    } catch (e) {
                        Utils.log("🟡", `手机端搜索失败: ${e.message}`);
                    }
                    if (i < mobLimit - 1 && mobProgress < mobMax) {
                        const span = Number(GM_getValue("Config.span", 30));
                        const wait = Utils.randomRange((span-15)*1000, (span+15)*1000);
                        await Utils.delay(wait);
                    }
                }
                Utils.log(mobProgress >= mobMax ? "✅" : "🟡", `手机端搜索本轮结束，估算进度 ${Math.min(mobProgress, mobMax)}/${mobMax}`);
            }

            const finalInfo = await API.getRewardsInfo(3, true);
            if (finalInfo) {
                const finalMob = finalInfo.mobile || { progress: 0, max: 0 };
                const mobDoneFinal = !(Number(finalMob.max) > 0) || Number(finalMob.progress) >= Number(finalMob.max);
                const pcDone2 = finalInfo.pc.progress >= finalInfo.pc.max;
                if (pcDone2 && mobDoneFinal) {
                    this.searchDate = RewardsAuto.state.dateNowNum;
                    this.save();
                    RewardsAuto.state.restrictedTimes = 0;
                    GM_setValue("Config.restrictedTimes", 0);
                    GM_setValue("Config.lastSearchProgress", -1);
                    GM_log(`🔵 🔍 搜索任务完成！PC: ${finalInfo.pc.progress}/${finalInfo.pc.max}${Number(finalMob.max) > 0 ? `，手机: ${finalMob.progress}/${finalMob.max}` : ""}`);
                } else {
                    Utils.log("🟡", `搜索已执行，配额未满 PC: ${finalInfo.pc.progress}/${finalInfo.pc.max}${Number(finalMob.max) > 0 ? `，手机: ${finalMob.progress}/${finalMob.max}` : ""}`);
                }
                // 半程推送：搜索任务达到 50% 时当天推送一次
                await this.notifyHalfIfNeeded(finalInfo);
            } else {
                Utils.log("🟡", "搜索已执行，但无法获取最终配额状态");
            }
        },

        async doDailySet() {
            if (!GM_getValue("Tasks.promos", true)) return;
            const today = Utils.getTodayNum();
            const pre = RewardsAuto.precheck;
            const serverDailyPending = Boolean(pre && pre.dateNum === today && pre.dailySet?.known && pre.dailySet.done < pre.dailySet.total);
            if (this.dailySetDate === today) {
                if (!serverDailyPending) {
                    Utils.log("✅", "每日活动已完成");
                    return;
                }
                Utils.log("🟡", `每日活动日期已标记，但服务端 ${pre.dailySet.done}/${pre.dailySet.total} 未完成，重置后补跑`);
                this.dailySetDate = 0;
                this.save();
            }
            const attemptKey = "Config.dailySetAttemptState";
            let attempt = GM_getValue(attemptKey, { date: 0, count: 0 }) || { date: 0, count: 0 };
            if (attempt.date !== today) attempt = { date: today, count: 0 };
            if (attempt.count >= 3) {
                Utils.log("🟡", "每日活动本轮已尝试 3 次，等待下次运行");
                return;
            }
            // v1.8.2：本轮先计数；若本轮成功完成则在末尾清零（失败才累计，上限 3）
            attempt.count++;
            GM_setValue(attemptKey, attempt);
            const processedKey = "Config.dailySetProcessed";
            let processed = GM_getValue(processedKey, []);
            if (processed.length > 0 && processed[0]?.date !== today) processed = [];
            const processedIds = new Set(processed.map(p => p.offerId));
            // 用启动预检的服务端状态预填充，避免重复处理已经做完的任务
            if (pre && pre.dateNum === RewardsAuto.state.dateNowNum) {
                (pre.completedOfferIds || []).forEach(id => processedIds.add(id));
            } else {
                try {
                    const serverStats = await API.getServerStats();
                    (serverStats.completedOfferIds || []).forEach(id => processedIds.add(id));
                } catch (_) {}
            }

            Utils.log("📅", `开始执行每日活动（已处理 ${processedIds.size} 个）...`);
            await Utils.randomDelay(2000, 5000);

            let ok = 0, fail = 0;
            const unconfirmedBefore = RewardsAuto.unconfirmedOfferIds.size;
            try {
                // 直接通过发现卡片获取未完成的 DailySet / 日常任务
                const allCards = await API.discoverCards();
                const dailyCards = allCards.filter(c => (c.kind === "daily" || c.offerId.includes("DailySet")) && !processedIds.has(c.offerId));

                Utils.log("📅", `发现 ${dailyCards.length} 个待处理每日活动`);
                for (const card of dailyCards) {
                    if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                    Utils.log("📅", `领取每日活动: ${card.title} +${card.points}p`);
                    await Utils.randomDelay(3000, 6000);
                    const res = await API.claimCard(card);
                    if (res) {
                        ok++;
                        processedIds.add(card.offerId);
                    } else {
                        fail++;
                    }
                }
            } catch (e) {
                if (e.message === "RUN_LOCK_LOST") throw e;
                Utils.log("🔴", `每日活动执行异常: ${e.message}`);
            }

            GM_setValue(processedKey, [...processedIds].map(id => ({ date: today, offerId: id })));

            this.dailySetStats = { ok, fail };
            const unconfirmed = RewardsAuto.unconfirmedOfferIds.size - unconfirmedBefore;
            // 预检显示服务端仍有未完成日常任务时，不因“没发现卡片”而提前标记完成
            // 全部成功且没有待确认项才标记完成；否则下一轮继续补做
            if (fail === 0 && unconfirmed === 0 && !serverDailyPending) {
                this.dailySetDate = today;
                // v1.8.2：成功即清零尝试计数，避免偶发失败耗尽次数后罢工
                GM_setValue(attemptKey, { date: today, count: 0 });
            }
            this.save();
            if (ok > 0 || fail > 0 || unconfirmed > 0) {
                GM_log(`🔵 每日活动完成: ${ok}成功/${fail}失败${unconfirmed > 0 ? `/${unconfirmed}待确认` : ""}`);
            } else {
                GM_log("✅ 无待处理的每日活动");
            }
        },

        /**
         * 自动领取 dashboard/DAPI 上待领取的积分
         * 依据社区实现：reportClaimAllPoints Server Action（body 为 []）
         * 成功与否只以服务端余额变化为准，避免「接口回执成功但实际未领取」
         */
        async doClaimPoints() {
            try {
                const before = await API.getBalance();
                if (!(before > 0)) {
                    Utils.debug("claim", `余额读取失败(before=${before})，跳过领取`);
                    return;
                }
                // 待领取来源 1：dashboard 服务端渲染的 pointClaim（2026-11 版站点唯一可靠来源）
                let amount = 0;
                let source = "";
                try {
                    const dash = await API.getDashboardData(true);
                    if (dash && dash.pointClaim && dash.pointClaim.points > 0) {
                        amount = dash.pointClaim.points;
                        source = "dashboard";
                    }
                } catch (_) {}
                // 待领取来源 2：DAPI 推广（progress>=max 且未 complete）
                if (amount <= 0) {
                    try {
                        const stats = await API.getServerStats();
                        if (stats && stats.claimable > 0) {
                            amount = stats.claimable;
                            source = "DAPI";
                        }
                    } catch (_) {}
                }
                if (amount <= 0) {
                    Utils.log("✅", "无可领取积分");
                    return;
                }
                Utils.log("🎁", `发现 ${amount} 积分待领取（${source}），尝试领取...`);

                // 策略 1: reportClaimAllPoints Server Action（无参数，body "[]"，action id 运行时动态解析）
                let acked = false;
                let responseSample = "";
                try {
                    const result = await API.claimAllPoints();
                    acked = Boolean(result && result.ok);
                    responseSample = result ? String(result.reason || "") : "";
                    if (acked) Utils.log("🟢", "reportClaimAllPoints 已受理");
                } catch (e) {
                    Utils.debug("claim", `reportClaimAllPoints 请求异常: ${e.message}`);
                }

                // 策略 2: 逐个领取可领取卡片（兜底）
                if (!acked) {
                    try {
                        const cards = await API.discoverCards();
                        const claimCards = cards.filter(c => /claim|领取|reward/i.test(`${c.offerId} ${c.title}`));
                        for (const c of claimCards) {
                            await Utils.randomDelay(2000, 5000);
                            if (await API.claimCard(c)) acked = true;
                        }
                    } catch (_) {}
                }

                // 以服务端余额变化为准：回执成功但余额未增加时只提示，不报「已领取」
                await Utils.randomDelay(3000, 6000);
                const after = await API.getBalance();
                const gained = (after > before) ? (after - before) : 0;
                Utils.debug("claim", `ack=${acked} before=${before} after=${after} gained=${gained} source=${source} resp=${responseSample}`);
                if (gained > 0) {
                    GM_log(`🎁 待领取积分已领取，+${gained}积分（${before}→${after}）`);
                } else if (acked) {
                    Utils.log("🟡", `领取请求已被服务端受理，但余额未变化（${before}），请稍后在 dashboard 确认`);
                } else {
                    Utils.notifyError("claimPoints", `有 ${amount} 积分待领取但未能自动领取，请手动前往 dashboard 领取`);
                }
            } catch (e) {
                Utils.log("🟡", `检测/领取积分失败: ${e.message}`);
            }
        },

        async doStreak() {
            Utils.log("📅", "开始检测连签任务...");
            try {
                const earnHtml = await API.getEarnHtml();
                const text = (earnHtml || "").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
                // 新版站点优先用 dashboard RSC 的 streakCounter（earn 页已不再输出「每日连续打卡 N」文案）
                let streakFound = false;
                try {
                    const dash = await API.getDashboardData();
                    if (dash && Number(dash.streak) > 0) {
                        this.streakDays = Number(dash.streak);
                        streakFound = true;
                        Utils.log("📅", `每日连续打卡：${this.streakDays} 天`);
                    }
                } catch (_) {}
                if (!streakFound) {
                    const streakDaysMatch = text.match(/每日连续打卡\s*(\d+)/);
                    if (streakDaysMatch) {
                        this.streakDays = parseInt(streakDaysMatch[1]) || 0;
                        Utils.log("📅", `每日连续打卡：${this.streakDays} 天`);
                    }
                }
                const taskPatterns = [
                    { name: "必应搜索连续打卡", pattern: /必应搜索连续打卡[\s\S]*?搜索:\s*(\d+)\/(\d+)/ },
                    { name: "每日连续打卡活动", pattern: /每日连续打卡活动[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                    { name: "必应应用连续打卡", pattern: /必应应用连续打卡[\s\S]*?签到:\s*(\d+)\/(\d+)/ },
                    { name: "视觉搜索连续打卡", pattern: /视觉搜索连续打卡[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                ];
                let visualSearchDone = true;
                for (const { name, pattern } of taskPatterns) {
                    const m = text.match(pattern);
                    if (m) {
                        const cur = parseInt(m[1]), max = parseInt(m[2]);
                        const done = cur >= max;
                        Utils.log(done ? "✅" : "📅", `${name}: ${cur}/${max}${done ? " 已完成" : ""}`);
                        if (name === "视觉搜索连续打卡" && !done) visualSearchDone = false;
                    }
                }
                if (!visualSearchDone) {
                    Utils.log("📅", "视觉搜索未完成，尝试后台打卡...");
                    try {
                        await Utils.xhr({
                            url: "https://www.bing.com/?features=vsstreak,vstooltip&form=ML2XES",
                            headers: {
                                "user-agent": RewardsAuto.ua.pc,
                                "referer": "https://www.bing.com/"
                            }
                        });
                        Utils.log("✅", "视觉搜索打卡请求已发送（后台）");
                        await Utils.randomDelay(3000, 5000);
                    } catch (e) {
                        Utils.log("🟡", `视觉搜索打卡失败: ${e.message}`);
                    }
                }
                const stampMatch = text.match(/(\d+)\s*个印章/) || text.match(/印章\s*(\d+)/);
                if (stampMatch) {
                    Utils.log("📅", `连签奖励印章进度: ${stampMatch[1]}/12`);
                }
                Utils.log("📅", "连签任务检测完成，未完成任务将由活动卡片模块处理");
            } catch (e) {
                Utils.log("🔴", `连签任务异常: ${e.message}`);
            }
        },

        /**
         * 启动预检：一次性读取服务端真实状态，供各任务跳过已完成项
         * @returns {Promise<Object|null>} getServerStats() 结果（附带 dateNum）
         */
        async precheck() {
            try {
                const stats = await API.getServerStats();
                if (!stats) return null;
                stats.dateNum = RewardsAuto.state.dateNowNum;
                RewardsAuto.precheck = stats;
                (stats.completedOfferIds || []).forEach(id => RewardsAuto.claimedOfferIds.add(id));
                /**
                 * 格式化“进度/上限”或“完成/总数”
                 * @param {Object} item 统计项
                 * @returns {string} 展示文本
                 */
                const fmt = (item) => {
                    if (!item || !item.known) return "—";
                    if (item.total !== undefined) return `${item.done}/${item.total}`;
                    return `${item.progress}/${item.max}`;
                };
                const parts = [
                    `签到 PC${stats.signPC.done ? "✓" : "·"} APP${stats.signApp.done ? "✓" : "·"}`,
                    `阅读 ${fmt(stats.read)}`,
                    `搜索 ${fmt(stats.search)}`,
                    `日常 ${fmt(stats.dailySet)}`,
                    `任务卡 ${fmt(stats.punchcard)}`,
                    `活动 ${fmt(stats.evergreen)}`,
                    `待领取 ${stats.claimable > 0 ? "+" + stats.claimable : "0"}`
                ];
                Utils.log("🧭", `启动预检: ${parts.join(" · ")}`);
                return stats;
            } catch (e) {
                Utils.debug("precheck", `预检失败: ${e.message}`);
                return null;
            }
        },

        async runAll(force = false) {
            if (this.running) {
                Utils.log("🟡", "任务正在运行中，请勿重复触发");
                return;
            }
            // 持久化运行锁：service worker 被回收后内存标记会丢失，需以此判定是否已有轮次在跑
            if (!this.claimRunLock()) {
                Utils.log("🟡", "检测到上一轮任务仍在运行（心跳正常），本次跳过");
                return;
            }
            this.running = true;
            // 启动间隔自检：上次成功运行距今超过 12 小时就先补一条告警（每天最多一次）
            this.checkStartupGap();
            GM_setValue("Config.lastRunTs", Date.now());
            RewardsAuto.state.pc401 = false;
            RewardsAuto.humanNeeded.clear();
            try {
                RewardsAuto.state.startTime = Utils.getTimestamp();
                Utils.log("🚀", "启动全能自动化任务...");
                // 冷启动/休眠唤醒后先确认网络可用，避免首批请求超时被误判为任务失败
                if (!(await API.waitNetworkReady())) {
                    Utils.log("🔴", "网络持续未就绪，本轮中止（等待下次定时触发）");
                    return;
                }
                this.init();
                const startBalance = await API.getBalance();
                Utils.log("📊", `初始积分: ${startBalance ?? "—"}`);
                const regionOK = await API.checkRegion();
                let isTokenOK = false;
                if (regionOK) {
                    isTokenOK = await API.renewToken();
                    if (!isTokenOK) Utils.notifyError("token", "Token 获取失败，已跳过签入/阅读任务");
                } else {
                    Utils.notifyError("region", `IP 非大陆（${RewardsAuto.state.region}），已暂停全部任务${RewardsAuto.state.ipInfo ? `\n${RewardsAuto.state.ipInfo}` : ""}`);
                    return;
                }
                const retryDelay = 60000;
                const maxRetries = 2;
                const withRetry = async (taskFn, taskName, retries = 0) => {
                    try {
                        // 每步开始前刷新锁心跳；false 说明锁已被新轮接管，必须立即终止本轮
                        if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                        const result = await taskFn();
                        if (result === false && retries < maxRetries) {
                            Utils.log("🟡", `${taskName} 失败，${retryDelay/1000}秒后重试 (${retries + 1}/${maxRetries})`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        return result;
                    } catch (e) {
                        if (e.message === "RUN_LOCK_LOST") throw e;
                        if (retries < maxRetries) {
                            Utils.log("🟡", `${taskName} 异常: ${e.message}，${retryDelay/1000}秒后重试`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        Utils.log("🔴", `${taskName} 失败: ${e.message}`);
                        return false;
                    }
                };
                if (regionOK && isTokenOK) {
                    // 启动预检：记录服务端真实完成状态，后续任务据此跳过已完成项
                    await this.precheck();
                    await withRetry(() => this.doSign(), "签到");
                    await Utils.randomDelay();
                    if (!RewardsAuto.state.pc401) {
                        await withRetry(() => this.doRead(), "阅读");
                        await Utils.randomDelay();
                    } else {
                        Utils.log("🟡", "PC会话已过期，跳过阅读任务");
                    }
                } else if (regionOK) {
                    await withRetry(() => this.doSign(), "签到");
                    await Utils.randomDelay();
                }
                await withRetry(() => this.doPromos(), "活动卡片");
                await Utils.randomDelay();
                await withRetry(() => this.doSearch(), "搜索");
                // 搜索行为会触达服务端签到计数器，此处复核一次可修正上报被拒造成的误判
                if (this.signPCPoint < 0) await this.recheckPCSign();
                await withRetry(() => this.doStreak(), "连签检测");
                await Utils.randomDelay();
                Utils.log("📅", "开始执行每日活动任务...");
                await Utils.randomDelay();
                await withRetry(() => this.doDailySet(), "每日活动");
                try {
                    await this.doClaimPoints();
                } catch (e) {
                    if (e.message === "RUN_LOCK_LOST") throw e;
                    Utils.log("🟡", `领取积分执行异常: ${e.message}`);
                }
                if (this.promosDate === RewardsAuto.state.dateNowNum && this.dailySetDate === RewardsAuto.state.dateNowNum) {
                    Utils.log("✅", "二次扫描跳过：活动卡片与每日活动均已完成");
                } else {
                    Utils.log("🔄", "二次扫描：检查是否有新解锁的卡片...");
                    await Utils.randomDelay(3000, 8000);
                    const newCards = await API.discoverCards();
                    if (newCards.length > 0) {
                        Utils.log("🧩", `二次扫描发现 ${newCards.length} 个新卡片`);
                        let ok = 0, fail = 0;
                        for (const card of newCards) {
                            if (!this.touchRunLock()) throw new Error("RUN_LOCK_LOST");
                            Utils.log("  ", `[${RewardsAuto.kindText[card.kind] || card.kind}] ${card.title} +${card.points}p（${card.offerId}）`);
                            if (card.kind === "quiz" && !GM_getValue("Tasks.quiz", true)) continue;
                            await Utils.randomDelay(3000, 8000);
                            const result = await API.claimCard(card);
                            result ? ok++ : fail++;
                        }
                        Utils.log("🔵", `二次扫描完成: ${ok}成功/${fail}失败`);
                    } else {
                        Utils.log("✅", "二次扫描：无新卡片");
                    }
                }
                const endTime = Utils.getTimestamp();
                // 扣除休眠/浏览器回收造成的空档，避免出现“本轮用时 5.9 小时”这类失真数据
                const totalTime = ((endTime - RewardsAuto.state.startTime - this.sleepMs) / 1000).toFixed(1);
                // 汇总数据全部取自服务端（今日获取=earn 页 totalPoints，余额=DAPI balance）
                const stats = await API.getServerStats();
                const enabled = (key) => GM_getValue(key, true);
                const signDone = (stats.signPC.done && stats.signApp.done) ||
                    (this.signDate === RewardsAuto.state.dateNowNum && this.signPCPoint >= 0 && this.signAppPoint >= 0);
                const allDone =
                    (!enabled("Tasks.sign") || signDone) &&
                    (!enabled("Tasks.read") || (stats.read.known && stats.read.progress >= stats.read.max)) &&
                    (!enabled("Tasks.search") || (stats.search.known && stats.search.progress >= stats.search.max)) &&
                    (!enabled("Tasks.promos") || (
                        (!stats.dailySet.known || stats.dailySet.done >= stats.dailySet.total) &&
                        (!stats.punchcard.known || stats.punchcard.done >= stats.punchcard.total) &&
                        (!stats.evergreen.known || stats.evergreen.done >= stats.evergreen.total)
                    ));
                const report = this.buildReport(stats, "final");
                const hour = new Date().getHours();
                // 全部完成推送一次日报；未完成则在 22 点后推送一次当日日报
                if (allDone || hour >= 22) {
                    if (Utils.markNotify("summary")) {
                        Utils.log("📊", report, true);
                    } else {
                        GM_log("📊 今日日报已推送过，本轮仅记录");
                    }
                } else {
                    // 未完成时只留一行摘要，不把整份日报写进日志
                    GM_log(`📊 今日任务尚未全部完成，暂不推送日报（阅读 ${stats.read.progress}/${stats.read.max} · 搜索 ${stats.search.progress}/${stats.search.max}）`);
                }
                GM_log(`⏱️ 本轮用时 ${totalTime} 秒`);
            } catch (e) {
                if (e.message === "RUN_LOCK_LOST") {
                    Utils.log("🟡", "运行锁已被其他轮次接管，本轮提前结束");
                } else {
                    // 定时任务里的异常不能抛出，否则会变成未处理的 Promise 拒绝
                    Utils.log("🔴", `本轮执行异常: ${e.message}`);
                }
            } finally {
                this.running = false;
                this.releaseRunLock();
            }
        }
    };

    GM_registerMenuCommand("🔑 手动授权", () => {
        GM_openInTab("https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&response_type=code&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&redirect_uri=https://login.live.com/oauth20_desktop.srf", { active: true });
    });

    /**
     * 兑换一次授权码并返回结构化结果
     * 菜单粘贴 / 面板填写 / 授权回调页共用同一套逻辑，避免三处各写一遍导致行为不一致
     * @param {string} code 微软 OAuth 授权码
     * @returns {Promise<{ok:boolean,concurrentOk:boolean,hint:string}>} ok=本上下文兑换成功；concurrentOk=其他上下文已成功
     */
    async function exchangeAuthCode(code) {
        const startedAt = Utils.getTimestamp();
        // 记录兑换前的凭据值：并发成功判定只认“本轮新出现的凭据”，
        // 旧 refresh 一直躺在存储里不算成功（它可能正是失效的那把）
        const tokenBefore = GM_getValue("Config.token", false);
        const accessBefore = GM_getValue("Config.accessToken", false);
        RewardsAuto._codeExchanged = false;
        let ok = false;
        try {
            ok = await API.renewToken(true, code);
        } catch (e) {
            return { ok: false, concurrentOk: false, hint: `（兑换异常: ${e.message}）` };
        }
        if (!ok) {
            const preErr = GM_getValue("Config.lastTokenError", null);
            const errIsOwn = Boolean(preErr && Number(preErr.t || 0) >= startedAt);
            // 本次码根本没被兑换（例如被进行中的无码续期吞掉），用同一码补一次
            if (!errIsOwn && !API.hasUsableToken()) {
                await Utils.delay(2000);
                try { ok = await API.renewToken(true, code); } catch (_) {}
            }
        }
        const tokenAfter = GM_getValue("Config.token", false);
        const accessAfter = GM_getValue("Config.accessToken", false);
        const concurrentOk = Boolean(
            (tokenAfter && tokenAfter !== tokenBefore)
            || (accessAfter && accessAfter !== accessBefore && Number(GM_getValue("Config.accessExpiresAt", 0)) > Date.now())
        );
        const lastErr = GM_getValue("Config.lastTokenError", null);
        // 只有本轮新产生的错误才展示：过期的历史错误（如几天前的 no_code）会误导排查
        const hint = (lastErr && Number(lastErr.t || 0) >= startedAt)
            ? `（最近错误: ${lastErr.grant} → ${lastErr.error} ${lastErr.description || ""}）`
            : "（本次未产生新的授权错误，可能败给并发兑换）";
        return { ok, concurrentOk, hint };
    }

    /**
     * 兑换并打印结果（菜单场景统一入口）
     * @param {string} code 授权码
     * @param {string} okText 成功提示文案
     */
    async function exchangeAndReport(code, okText = "🎉 Token获取成功！授权已完成") {
        const res = await exchangeAuthCode(code);
        if (res.ok) {
            Utils.safeAlert(okText);
        } else if (res.concurrentOk) {
            Utils.safeAlert("🎉 Token已由其他上下文获取成功！授权已完成");
        } else {
            Utils.safeAlert(`⚠️ Token获取失败${res.hint}\n请重新点击「🔑 手动授权」并粘贴最新的跳转URL`);
        }
        return res;
    }

    /**
     * 面板/设置页写入授权码后的即时兑换
     * 背景：UserConfig 面板只把值写进存储，脚本原本要等下一轮定时（最长 20 分钟）才读取并兑换，
     *      而微软授权码是短时效的，等到那时基本必然 invalid_grant——这就是「面板填了不能用」的根因。
     *      这里在写入后立刻兑换，并用 Config.codeClaim 去重，避免多个上下文抢同一个一次性码。
     * @param {string} raw 面板写入的原始值（完整跳转URL 或裸授权码）
     * @returns {Promise<boolean>} 是否兑换成功（含被其他上下文成功兑换）
     */
    async function handleConfigCode(raw) {
        const code = Utils.extractAuthCode(raw);
        if (!code) return false;
        // 抢占标记：先写自己的唯一令牌再回读，回读仍是自己的才算抢到，
        // 避免「多个上下文同时看到新码 → 同时兑换同一个一次性码 → 一方 invalid_grant」
        if (GM_getValue("Config.codeClaim", "") === code) return false;
        const claimId = Utils.getRandomUUID();
        GM_setValue("Config.codeClaim", code);
        GM_setValue("Config.codeClaimBy", claimId);
        await Utils.delay(150);
        if (GM_getValue("Config.codeClaimBy", "") !== claimId) return false;
        Utils.log("🟢", "检测到面板填写的新授权码，正在兑换 Token...");
        const res = await exchangeAuthCode(code);
        if (res.ok || res.concurrentOk) {
            // 兑换成功后清掉面板里的码，避免下一轮定时把用过的码再兑换一次
            if (String(GM_getValue("Config.code", "") || "").trim() === String(raw).trim()) {
                GM_setValue("Config.code", "");
            }
            Utils.log("🟢", res.ok ? "面板授权码兑换成功，授权已完成" : "面板授权码已由其他上下文兑换成功");
            return true;
        }
        Utils.log("🔴", `面板授权码兑换失败${res.hint}，请重新点击「🔑 手动授权」获取新的跳转URL`);
        return false;
    }

    // v1.8.1：原「⚡ 兑换面板授权码」已并入「📋 粘贴/兑换授权码」（弹窗留空即读取面板里的授权码），
    // 三个授权入口收敛为两个，避免同名功能分散在菜单里

    /**
     * 面板写入监听：ScriptCat/Tampermonkey 的 GM_addValueChangeListener 会在其他上下文
     * （设置页、其它标签）写入 Config.code 时回调，用它做「填完即刻生效」
     */
    try {
        if (typeof GM_addValueChangeListener === "function") {
            GM_addValueChangeListener("Config.code", (_name, _oldValue, newValue) => {
                const raw = String(newValue || "").trim();
                if (!raw) return;
                // 让写入方先完成自己的落盘，再发起兑换
                setTimeout(() => { handleConfigCode(raw).catch(() => {}); }, 800);
            });
        }
    } catch (_) {}

    GM_registerMenuCommand("📋 粘贴/兑换授权码", async () => {
        const input = Utils.safePrompt(
            "粘贴授权页面跳转后的完整URL（或直接粘贴授权码）:\n\n"
            + "· 留空确定 = 使用设置面板里已填的「授权码链接」\n"
            + "· 取消 = 不做任何操作"
        );
        // 取消：safePrompt 返回 null
        if (input === null || input === undefined) return;
        const typed = String(input).trim();

        // 留空分支：等价于原「⚡ 兑换面板授权码」，读取设置面板里填写的内容
        if (!typed) {
            const panelRaw = String(GM_getValue("Config.code", "") || "").trim();
            if (!panelRaw) {
                Utils.safeAlert("⚠️ 设置面板里的「授权码链接」也是空的。\n请先点击「🔑 手动授权」，把跳转后的完整网址粘进弹窗或设置面板。");
                return;
            }
            const panelCode = Utils.extractAuthCode(panelRaw);
            if (!panelCode) {
                Utils.safeAlert("⚠️ 面板里的内容不是有效授权码。\n请粘贴 oauth20_desktop.srf?code=... 格式的完整跳转网址。");
                return;
            }
            // 手动触发的兑换不受 codeClaim 限制（用户明确要求重试）
            GM_setValue("Config.codeClaim", panelCode);
            Utils.safeAlert("✅ 已读取面板授权码，正在兑换 Token...");
            try {
                const res = await exchangeAndReport(panelCode, "🎉 面板授权码兑换成功，授权已完成");
                // 兑换成功后清掉面板里的码，避免下一轮定时把一次性码再兑换一次
                if ((res.ok || res.concurrentOk) && String(GM_getValue("Config.code", "") || "").trim() === panelRaw) {
                    GM_setValue("Config.code", "");
                }
            } catch (e) {
                Utils.safeAlert(`⚠️ 兑换出错: ${e.message}`);
            }
            return;
        }

        const code = Utils.extractAuthCode(typed);
        if (!code) {
            Utils.safeAlert("⚠️ 未识别到有效授权码！\n请粘贴 oauth20_desktop.srf?code=... 格式的完整跳转URL。");
            return;
        }
        // 不把授权码写入共享存储，避免定时轮询/其他页面抢先把同一码兑换掉。
        // 旧 refresh_token 也不在这里删除：新码失败时仍可回退到旧 token。
        Utils.safeAlert("✅ 授权码已识别，正在尝试获取 Token...");
        try {
            await exchangeAndReport(code);
        } catch (e) {
            Utils.safeAlert(`⚠️ Token获取出错: ${e.message}`);
        }
    });

    GM_registerMenuCommand("📊 运行状态", () => {
        const token = GM_getValue("Config.token", false);
        const time = GM_getValue("Config.tokenTime", 0);
        let ageStr = "未知";
        if (time > 0) {
            const diff = Utils.getTimestamp() - time;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const parts = [];
            if (days > 0) parts.push(`${days}天`);
            if (hours > 0) parts.push(`${hours}小时`);
            parts.push(`${minutes}分钟`);
            ageStr = parts.join("");
        }
        const tokenDate = time > 0 ? new Date(time).toLocaleString("zh-CN") : "未知";
        const access = GM_getValue("Config.accessToken", false);
        const accessExp = Number(GM_getValue("Config.accessExpiresAt", 0));
        const accessState = access ? (accessExp > Date.now() ? "有效" : "已过期") : "无";
        const lastErr = GM_getValue("Config.lastTokenError", null);
        const errLine = lastErr
            ? `最近错误: [${new Date(Number(lastErr.t) || 0).toLocaleTimeString("zh-CN")}] ${lastErr.grant} → ${lastErr.error} ${lastErr.description || ""}`
            : "最近错误: 无";
        // v1.8.1：状态面板补上推送与今日进度，避免用户再去别处确认
        const pushCfg = PushPlus.read();
        const pushState = PushPlus.ready()
            ? "PushPlus（微信）+ 浏览器通知"
            : (pushCfg.enabled ? "仅浏览器通知（PushPlus 未配 Token）" : "仅浏览器通知（PushPlus 已关闭）");
        const broState = GM_getValue("Notice.bro", true) ? "开" : "关";
        const todayDone = [["签到", TaskManager.signDate], ["阅读", TaskManager.readDate], ["活动", TaskManager.promosDate], ["搜索", TaskManager.searchDate]]
            .filter(([, d]) => d === RewardsAuto.state.dateNowNum).length;
        const plainText = `RefreshToken: ${token ? "已保存" : "无"}\n`
            + `获取时间: ${tokenDate}\n已过: ${ageStr}\n`
            + `AccessToken: ${accessState}\n授权码: ${GM_getValue("Config.code", "") ? "有" : "无"}\n`
            + `${errLine}\n\n`
            + `今日进度: ${todayDone}/4 项（签到·阅读·活动·搜索）\n`
            + `浏览器通知: ${broState}\n推送目标: ${pushState}\n`
            + `版本: ${GM_info.script.version}`;
        const panel = Utils.showPanel({
            title: "运行状态",
            meta: `v${GM_info.script.version}`,
            stats: [
                { label: "今日得分", value: "…" },
                { label: "任务完成", value: "…" },
                { label: "账户余额", value: "…" },
                { label: "连续签到", value: "…" }
            ],
            logTitle: "账号与推送",
            log: [
                `RefreshToken   ${token ? `已保存 · ${ageStr}前` : "无"}`,
                `获取时间       ${tokenDate}`,
                `AccessToken    ${accessState}`,
                `授权码         ${GM_getValue("Config.code", "") ? "有" : "无"}`,
                `浏览器通知     ${broState}　推送目标 ${pushState}`,
                `今日进度       ${todayDone}/4 项（签到·阅读·活动·搜索）`,
                errLine,
                `版本           v${GM_info.script.version}`
            ],
            text: plainText,
            textTitle: "纯文本（可复制）",
            actions: [
                {
                    label: "立即运行",
                    primary: true,
                    onClick: (area, close) => {
                        close();
                        TaskManager.runAll(true).catch(e => Utils.log("🔴", `手动运行失败: ${e.message}`));
                    }
                },
                {
                    label: "刷新",
                    onClick: () => {
                        API.getServerStats().then((stats) => {
                            const model = Utils.buildPanelModel(stats, { tokenReady: Boolean(token) });
                            panel.setStats(model.stats);
                            panel.setRows(model.rows);
                        }).catch((e) => Utils.log("🔴", `刷新统计失败: ${e.message}`));
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
        // 面板先出，统计异步补进来（getServerStats 需要一次网络往返）
        API.getServerStats().then((stats) => {
            const model = Utils.buildPanelModel(stats, { tokenReady: Boolean(token) });
            if (panel) {
                panel.setStats(model.stats);
                panel.setRows(model.rows);
            }
        }).catch((e) => Utils.log("🔴", `获取运行统计失败: ${e.message}`));
    });

    // v1.8.1：去掉「忽略次日锁定」——跨日跳过逻辑已在 v1.8.0 删除，标签留着会误导
    GM_registerMenuCommand("🚀 立即运行", () => {
        TaskManager.runAll(true).catch(e => Utils.log("🔴", `手动运行失败: ${e.message}`));
    });

    GM_registerMenuCommand("🔔 配置 PushPlus 推送", () => {
        /**
         * 直接读写与 UserConfig 面板同一批存储键，
         * 面板和菜单改的是同一份数据，不会出现“面板填了但脚本读不到”
         */
        const cfg = PushPlus.read();
        const lines = [
            "📲 PushPlus 微信推送配置",
            "==================",
            "",
            `PushPlus Token: ${cfg.token ? "已配置" : "（空）"}`,
            "   说明: 微信扫码登录 pushplus.plus，首页即可获取 token",
            "",
            `PushPlus 推送开关: ${cfg.enabled ? "✅ 开启" : "❌ 关闭"}`,
            `浏览器通知: ${GM_getValue("Notice.bro", true) ? "✅ 开启" : "❌ 关闭"}（用菜单「🔕/🔔」切换）`,
            "",
            `实际推送目标: ${PushPlus.ready() ? "PushPlus（微信）" : "仅浏览器通知"}`,
            "",
            "输入 1 配置 Token，输入 2 切换推送开关，输入 3 发送测试消息，输入 9 清空 Token，输入 0 退出："
        ];
        const choice = Utils.safePrompt(lines.join("\n"));
        if (!choice) return;
        const num = parseInt(choice);
        if (num === 0) return;
        if (num === 1) {
            const current = String(GM_getValue("Notice.pushplusToken", "") || "");
            const next = Utils.safePrompt(`配置 PushPlus Token\n\n微信扫码登录 pushplus.plus 后，首页即可获取自己的 token。\n\n当前值: ${current ? "已配置" : "(空)"}\n\n请输入新的值（留空即清除）：`, current);
            if (next === null) return;
            GM_setValue("Notice.pushplusToken", next.trim());
            Utils.safeAlert(`PushPlus Token 已${next.trim() ? "保存" : "清除"}！`);
            return;
        }
        if (num === 2) {
            GM_setValue("Notice.pushplus", !cfg.enabled);
            Utils.safeAlert(`PushPlus 推送已${!cfg.enabled ? "开启" : "关闭"}！`);
            return;
        }
        if (num === 3) {
            // v1.8.1：原「📢 测试通知」并入此处；同时修掉一个老问题——
            // 旧写法先设 state.sendMSG 再调 Utils.log(…, true)，而 log 内部会用 `${icon} ${msg}`
            // 覆盖 sendMSG，导致推出去的是「📢 测试通知已发送」而不是自定义测试文案
            const testText = "🧪 这是一条测试消息\n如果你看到这条消息，说明通知接口配置成功！";
            RewardsAuto.state.sendMSG = testText;
            try { GM_log("📢", testText); } catch (_) {}
            if (GM_getValue("Notice.bro", true)) {
                try { GM_notification({ title: GM_info.script.name, text: testText }); } catch (_) {}
            }
            const nowCfg = PushPlus.read();
            if (PushPlus.ready()) Utils.sendPushPlus();
            const testLines = [
                "📢 测试消息已发出",
                `浏览器通知: ${GM_getValue("Notice.bro", true) ? "已发送" : "已关闭"}`,
                `PushPlus 微信推送: ${PushPlus.ready() ? "已发送（结果见脚本日志）" : (nowCfg.enabled ? "未配置 Token" : "已关闭")}`
            ];
            if (!PushPlus.ready()) {
                testLines.push("", "配置方式：本菜单输入 1 填 Token，或脚本设置面板 Notice 分组");
            }
            Utils.safeAlert(testLines.join("\n"));
            return;
        }
        if (num === 9) {
            if (!Utils.safeConfirm("确定清空 PushPlus Token 吗？清空后仅使用浏览器通知。")) return;
            GM_setValue("Notice.pushplusToken", "");
            Utils.safeAlert("PushPlus 配置已清空，之后仅使用浏览器通知。");
            return;
        }
        Utils.safeAlert("无效的编号！");
    });

    // v1.8.1：原「📢 测试通知」已并入「🔔 配置 PushPlus 推送」的第 3 项，此处不再单独注册菜单

    /**
     * 调试信息面板：汇总环境、账号、任务、登录与最近接口响应
     * 默认不在日志中输出调试细节，需要时从菜单统一查看
     */
    async function showDebugInfo() {
        /**
         * 构造调试信息（同时产出结构化面板模型与纯文本）
         * @returns {Promise<{text:string,stats:Array<Object>,rows:Array<Object>,log:Array<string>}>} 调试数据
         */
        const buildDebugText = async () => {
            // 后台实例的内存态可能为空，先续期 Token，否则 DAPI 数据全部取不到
            let tokenError = "";
            if (!RewardsAuto.state.token) {
                try {
                    const ok = await API.renewToken();
                    if (!ok || !RewardsAuto.state.token) tokenError = "续期失败，需重新授权";
                } catch (e) {
                    tokenError = e.message;
                }
            }
            let stats = null;
            try { stats = await API.getServerStats(); } catch (e) { tokenError = tokenError || e.message; }
            /**
             * 格式化进度/分组统计
             * @param {Object} item 统计项
             * @returns {string} 展示文本
             */
            const fmt = (item) => {
                if (!item || !item.known) return "—";
                if (item.total !== undefined) return `${item.done}/${item.total}`;
                return `${item.progress}/${item.max}`;
            };
            // 强制重新扫描 Server Action：earn 与 dashboard 的 chunk 可能不同，合并后一起扫描
            let actions = {};
            try {
                const [earnHtml, dashboardHtml] = await Promise.all([
                    Utils.xhr({ url: "https://rewards.bing.com/earn" }),
                    Utils.xhr({ url: "https://rewards.bing.com/dashboard" })
                ]);
                actions = await API.resolveServerActions(`${earnHtml || ""}\n${dashboardHtml || ""}`, true);
            } catch (_) {
                actions = RewardsAuto._serverActions || GM_getValue("Config.serverActions", null) || {};
            }
            let cookieNames = [];
            try {
                const cookie = await Utils.getCookieString("https://rewards.bing.com/");
                cookieNames = cookie ? cookie.split("; ").map(p => p.split("=")[0]) : [];
            } catch (_) {}
            const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
            const recent = RewardsAuto.debugBuffer.slice(-30).reverse()
                .map(e => `${new Date(e.t).toLocaleTimeString("zh-CN")} [${e.tag}] ${e.msg.slice(0, 180)}`)
                .join("\n") || "（无）";
            const sections = [
                `【环境】\n${GM_info.script.version} · ${/Edg\//.test(ua) ? "Edge" : "Chrome"} · ${new Date().toLocaleString("zh-CN")}`,
                `【账号】\n余额 ${stats && stats.balance !== null ? stats.balance : "—"} · 今日 ${stats && stats.earnedToday !== null ? `+${stats.earnedToday}` : "—"}\nToken ${RewardsAuto.state.token ? "已就绪" : `未获取${tokenError ? `（${tokenError}）` : ""}`} · 地区 ${RewardsAuto.state.region} · 主机 ${RewardsAuto.state.host}\n最近授权错误: ${(() => { const le = GM_getValue("Config.lastTokenError", null); return le ? `[${new Date(Number(le.t) || 0).toLocaleTimeString("zh-CN")}] ${le.grant} → ${le.error} ${le.description || ""}` : "无"; })()}`,
                `【任务】\n签到 PC ${stats && stats.signPC.done ? "✅" : "⏳"} / APP ${stats && stats.signApp.done ? "✅" : "⏳"}\n阅读 ${fmt(stats && stats.read)} · 搜索 ${fmt(stats && stats.search)}\n日常 ${fmt(stats && stats.dailySet)} · 任务卡 ${fmt(stats && stats.punchcard)} · 活动 ${fmt(stats && stats.evergreen)}\n待领取 ${stats && stats.claimable > 0 ? `+${stats.claimable}` : "0"} · 已完成 ${stats ? stats.completedOfferIds.length : 0} 项`,
                `【登录】\nCookie ${cookieNames.length} 项：${cookieNames.slice(0, 12).join(", ") || "空"}${RewardsAuto.state.pc401 ? "\nPC 会话：未登录" : ""}`,
                `【Server Action】\nreportActivity ${actions.reportActivity ? "已解析" : "未解析"} · reportClaimAllPoints ${actions.reportClaimAllPoints ? "已解析" : "未解析"}\n已发现 ${actions.all ? actions.all.length : 0} 个动作ID：${Object.values(actions.names || {}).slice(0, 10).join(", ") || "—"}`,
                `【最近调试】\n${recent}`
            ];
            const model = Utils.buildPanelModel(stats, { tokenReady: Boolean(RewardsAuto.state.token) });
            const lastErr = GM_getValue("Config.lastTokenError", null);
            return {
                text: sections.join("\n\n"),
                stats: model.stats,
                rows: model.rows,
                log: [
                    `环境        ${GM_info.script.version} · ${/Edg\//.test(ua) ? "Edge" : "Chrome"} · ${new Date().toLocaleString("zh-CN")}`,
                    `Token       ${RewardsAuto.state.token ? "已就绪" : `未获取${tokenError ? `（${tokenError}）` : ""}`} · 地区 ${RewardsAuto.state.region} · 主机 ${RewardsAuto.state.host}`,
                    lastErr ? `最近授权错误 [${new Date(Number(lastErr.t) || 0).toLocaleTimeString("zh-CN")}] ${lastErr.grant} → ${lastErr.error} ${lastErr.description || ""}` : "最近授权错误 无",
                    `Cookie      ${cookieNames.length} 项${RewardsAuto.state.pc401 ? " · PC 会话未登录" : ""}`,
                    `Server Act  reportActivity ${actions.reportActivity ? "已解析" : "未解析"} · claimAll ${actions.reportClaimAllPoints ? "已解析" : "未解析"} · ${actions.all ? actions.all.length : 0} 个动作`,
                    `已完成      ${stats ? stats.completedOfferIds.length : 0} 项 offer`
                ]
            };
        };

        // 后台上下文没有 DOM 时降级为通知
        const notify = (text) => {
            try { GM_notification({ title: "🔧 调试信息", text }); } catch (_) {}
        };
        // 页面上下文直接使用浏览器原生弹框（与旧版导出体验一致）；后台上下文降级为通知
        try { Utils.safeAlert("🔧 正在采集调试信息，请稍候…"); } catch (_) { notify("正在采集，请稍候…"); }
        try {
            const debug = await buildDebugText();
            const text = debug.text;
            GM_setValue("Config.lastDebugInfo", text);
            const copied = Utils.copyText(text);
            const note = copied
                ? "✅ 已复制到剪贴板，可直接粘贴"
                : "⚠️ 自动复制失败，请点击「复制全部」或手动全选复制";
            GM_setValue("Config.pendingDebugNote", note);
            // 不再用原生 alert 打断流程：复制结果直接作为面板的 note 提示条
            const panel = Utils.showPanel({
                title: "调试信息",
                meta: `v${GM_info.script.version}`,
                note,
                stats: debug.stats,
                rows: debug.rows,
                logTitle: "环境与账号",
                log: debug.log,
                text,
                textTitle: "完整调试文本（可复制）",
                actions: [
                    {
                        label: "复制全部",
                        primary: true,
                        onClick: (area) => {
                            const ok = Utils.copyText(text);
                            Utils.log(ok ? "✅" : "⚠️", ok ? "调试信息已复制" : "复制失败，请手动全选", false);
                            if (area) {
                                area.focus();
                                area.select();
                            }
                        }
                    },
                    { label: "关闭", onClick: (area, close) => close() }
                ]
            });
            if (!panel) {
                GM_setValue("Config.pendingDebugView", true);
                try { GM_openInTab("https://rewards.bing.com/earn", { active: true }); } catch (_) {}
                notify(note.replace(/^[✅⚠️]+\s*/, ""));
            }
        } catch (e) {
            try { Utils.safeAlert(`⚠️ 调试信息采集失败：${e.message}`); } catch (_) { notify(`采集失败：${e.message}`); }
        }
    }



    /**
     * 诊断数据导出：采集服务端真实字段，用于校准推送中的积分与任务分类口径
     * - 覆盖 getuserinfo、DAPI(options=511/613)、earn、dashboard
     * - 自动脱敏账号标识与凭证，不导出 Token
     */
    async function exportDiagnostics() {
        /**
         * 递归脱敏：移除账号标识与凭证字段
         * @param {*} input 原始数据
         * @returns {*} 脱敏后的数据
         */
        const sanitize = (input) => {
            const sensitiveKey = /^(email|mail|username|user_name|displayname|display_name|firstname|first_name|lastname|last_name|cid|accountid|account_id|avatar|avatarurl|gamertag|token|accesstoken|refreshtoken|authorization)$/i;
            const walk = (value) => {
                if (Array.isArray(value)) return value.map(walk);
                if (value && typeof value === "object") {
                    const out = {};
                    for (const [key, val] of Object.entries(value)) {
                        out[key] = sensitiveKey.test(key) ? "[redacted]" : walk(val);
                    }
                    return out;
                }
                if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "***@***";
                return value;
            };
            return walk(input);
        };
        /**
         * 从页面 RSC/JSON 文本中提取指定键对应的 JSON 片段
         * @param {string} text 页面文本（已处理转义）
         * @param {string} key JSON 键名
         * @returns {string|null} 片段原文
         */
        const grabBlock = (text, key) => Utils.jsonBlock(text, key);
        /**
         * 解析 JSON 片段，失败时返回原文样本
         * @param {string|null} raw 片段原文
         * @returns {*} 解析结果
         */
        const parseBlock = (raw) => {
            if (!raw) return null;
            try { return JSON.parse(raw); } catch (_) { return { _raw: raw.slice(0, 2000) }; }
        };
        /**
         * 汇总 DAPI 推广任务关键字段（保留 attributes 全量键，便于识别分类）
         * @param {Object} p DAPI 推广任务
         * @returns {Object} 精简结构
         */
        const summarizePromo = (p) => {
            const a = p?.attributes || {};
            return {
                offerId: a.offerid || p?.offerId || p?.name || "",
                title: a.title || p?.title || p?.name || "",
                type: a.type || p?.type || "",
                category: a.category || p?.category || p?.promotionType || "",
                hidden: a.hidden ?? p?.hidden,
                complete: a.complete ?? p?.complete,
                progress: a.progress ?? a.activityprogress ?? p?.progress ?? p?.pointProgress,
                max: a.max ?? a.activitymax ?? p?.max ?? p?.pointProgressMax,
                points: p?.pointProgressMax ?? p?.points ?? a.pointmax,
                destination: a.destination || p?.destinationUrl || "",
                attributeKeys: Object.keys(a),
                attributes: a
            };
        };
        /**
         * 请求 DAPI 并返回关键结构
         * @param {number} options 接口 options 值
         * @returns {Promise<Object>} 结构化响应
         */
        const fetchDAPI = async (options) => {
            const res = await API.withTokenRetry(token => Utils.xhr({
                url: `https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=${options}`,
                headers: {
                    ...API.dapiHeaders(token, "cn", false)
                }
            }));
            if (!Utils.isJSON(res)) return { error: "非 JSON 响应", sample: String(res).slice(0, 300) };
            const response = JSON.parse(res).response || {};
            return {
                responseKeys: Object.keys(response),
                balance: response.balance,
                counters: response.counters,
                userStatus: response.userStatus,
                promotions: Array.isArray(response.promotions) ? response.promotions.map(summarizePromo) : undefined
            };
        };
        /**
         * 扫描页面文本中的“今日/赚取”相关字段
         * @param {string} text 页面文本
         * @returns {Object} 字段名与值
         */
        const scanTodayFields = (text) => {
            const hits = {};
            const patterns = [
                /"([A-Za-z0-9_]*(?:today|Today)[A-Za-z0-9_]*)"\s*:\s*("?[^",}\]]{0,60}"?)/g,
                /"([A-Za-z0-9_]*(?:earned|Earned)[A-Za-z0-9_]*)"\s*:\s*("?[^",}\]]{0,60}"?)/g
            ];
            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(text)) !== null) {
                    if (!(m[1] in hits)) hits[m[1]] = m[2].replace(/^"|"$/g, "");
                }
            }
            return hits;
        };

        try { Utils.safeAlert("🧪 正在采集诊断数据，请稍候（约 10 秒）…"); } catch (_) {
            try { GM_notification({ title: "🧪 诊断数据", text: "采集中，请稍候（约 10 秒）…" }); } catch (_) {}
        }
        try {
            await API.renewToken();
            const report = {
                generatedAt: new Date().toISOString(),
                scriptVersion: GM_info.script.version,
                tokenReady: Boolean(RewardsAuto.state.token),
                lastTokenError: GM_getValue("Config.lastTokenError", null),
                endpoints: {}
            };
            // v1.8.1：/api/getuserinfo 已于 2026-11 下线（实测 401 旧版错误页），改为采集 dashboard 的 RSC 数据
            try { report.endpoints.dashboardRSC = await API.getDashboardData(true); } catch (e) { report.endpoints.dashboardRSC = { error: e.message }; }
            try { report.endpoints.dapi511 = await fetchDAPI(511); } catch (e) { report.endpoints.dapi511 = { error: e.message }; }
            // options=613 的 counters 恒为 null（实测），不再重复采集；领取动作 ID 才是排障关键
            try { report.endpoints.claimActionId = await API.getClaimActionId(); } catch (e) { report.endpoints.claimActionId = { error: e.message }; }
            try { report.endpoints.rewardsInfo = await API.getRewardsInfo(); } catch (e) { report.endpoints.rewardsInfo = { error: e.message }; }
            try { report.endpoints.balance = await API.getBalance(); } catch (e) { report.endpoints.balance = { error: e.message }; }
            try {
                const earnHtml = (await Utils.xhr({ url: "https://rewards.bing.com/earn" }) || "").replace(/\\"/g, '"');
                report.endpoints.earnPage = {
                    pointsCounters: parseBlock(grabBlock(earnHtml, "pointsCounters")),
                    pointsHistory: parseBlock(grabBlock(earnHtml, "pointsHistory")),
                    todayFields: scanTodayFields(earnHtml)
                };
            } catch (e) {
                report.endpoints.earnPage = { error: e.message };
            }
            try {
                const dashboardHtml = (await Utils.xhr({ url: "https://rewards.bing.com/dashboard" }) || "").replace(/\\"/g, '"');
                const plainText = dashboardHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
                report.endpoints.dashboardPage = {
                    pointsCounters: parseBlock(grabBlock(dashboardHtml, "pointsCounters")),
                    pointsHistory: parseBlock(grabBlock(dashboardHtml, "pointsHistory")),
                    todayFields: scanTodayFields(dashboardHtml),
                    claimableText: (plainText.match(/.{0,60}(?:可领取|待领取|to claim).{0,60}/i) || [""])[0],
                    serverActions: Object.keys(await API.resolveServerActions(dashboardHtml))
                };
            } catch (e) {
                report.endpoints.dashboardPage = { error: e.message };
            }
            // 旧版 /api/reportactivity 已于 2026-11 下线（实测 POST 401），不再探测
            try {
                const searchHtml = String(await API.getSearchPage("rewards probe", false) || "");
                report.endpoints.searchProbe = {
                    length: searchHtml.length,
                    hasResults: /b_results|b_algo/i.test(searchHtml),
                    hasLogin: /_Rwho|SignOut|userinfo|Rewards/i.test(searchHtml),
                    head: searchHtml.slice(0, 300)
                };
            } catch (e) {
                report.endpoints.searchProbe = { error: e.message };
            }

            const json = JSON.stringify(sanitize(report), null, 2);
            // 后台 service worker 无 DOM 时，统一走剪贴板 + 通知
            const copied = Utils.copyText(json);
            GM_setValue("Config.lastDebugInfo", json);
            const note = copied
                ? "✅ 诊断数据已复制到剪贴板，请直接粘贴。"
                : "⚠️ 自动复制失败，请点「复制全部」后手动粘贴。";
            const panel = Utils.showPanel({
                title: "诊断数据",
                meta: `${(json.length / 1024).toFixed(1)} KB`,
                note,
                logTitle: "接口覆盖",
                log: Object.keys(report.endpoints || {}).map((k) => {
                    const item = report.endpoints[k];
                    if (!item) return `${k}  —`;
                    if (item.error) return `${k}  ✕ ${item.error}`;
                    const size = item.length || item.bytes || 0;
                    return `${k}  ✓ ${size ? `${size} B` : "ok"}`;
                }),
                text: json,
                textTitle: "完整 JSON（可复制）",
                actions: [
                    {
                        label: "复制全部",
                        primary: true,
                        onClick: (area) => {
                            Utils.copyText(json);
                            if (area) {
                                area.focus();
                                area.select();
                            }
                        }
                    },
                    { label: "关闭", onClick: (area, close) => close() }
                ]
            });
            if (!panel) {
                GM_setValue("Config.pendingDebugView", true);
                try { GM_openInTab("https://rewards.bing.com/earn", { active: true }); } catch (_) {}
                try {
                    GM_notification({
                        title: copied ? "🧪 诊断数据已复制" : "🧪 诊断数据",
                        text: copied ? "请直接粘贴到对话中" : "剪贴板不可用，已打开页面展示"
                    });
                } catch (_) {}
            }
        } catch (e) {
            try { Utils.safeAlert(`⚠️ 诊断数据采集失败：${e.message}`); } catch (_) {
                try { GM_notification({ title: "🧪 诊断数据采集失败", text: e.message }); } catch (_) {}
            }
        }
    }

    // 菜单注册：诊断相关收成一个入口，避免「调试信息」与「导出诊断数据」两个近似项并列
    GM_registerMenuCommand("🔧 诊断信息", async () => {
        const choice = Utils.safePrompt(
            "🔧 诊断信息\n"
            + "==================\n\n"
            + "1 = 查看运行调试信息（账号/任务/接口状态，查看后可复制）\n"
            + "2 = 导出完整诊断 JSON（含各接口原始字段，排障时用）\n"
            + "0 = 退出"
        );
        // 后台上下文（ScriptCat 的菜单常在无 DOM 的上下文执行）拿不到弹窗时默认走「查看调试信息」，
        // 该分支自带降级：复制到剪贴板 + 系统通知 + 打开 rewards 页展示
        const raw = choice === null || choice === undefined ? "" : String(choice).trim();
        const num = raw || (typeof document === "undefined" ? "1" : "");
        if (!num || num === "0") return;
        if (num === "1") { await showDebugInfo(); return; }
        if (num === "2") { await exportDiagnostics(); return; }
        Utils.safeAlert("无效的编号！");
    });

    const updateBroMenu = () => {
        const enabled = GM_getValue("Notice.bro", true);
        return enabled ? "🔕 关闭浏览器通知" : "🔔 开启浏览器通知";
    };
    GM_registerMenuCommand(updateBroMenu(), () => {
        const current = GM_getValue("Notice.bro", true);
        GM_setValue("Notice.bro", !current);
        Utils.safeAlert(`浏览器通知已${!current ? "开启" : "关闭"}`);
        Utils.safeReload();
    });

    /**
     * 跨上下文查看调试信息：后台菜单无 DOM 时，打开本页面后在此渲染
     */
    if (typeof document !== "undefined" && GM_getValue("Config.pendingDebugView", false)) {
        GM_setValue("Config.pendingDebugView", false);
        /**
         * 渲染上次保存的调试文本
         */
        const renderPendingDebug = () => {
            const text = GM_getValue("Config.lastDebugInfo", "（暂无调试信息）");
            Utils.showPanel({
                title: "调试信息",
                meta: `v${GM_info.script.version}`,
                note: GM_getValue("Config.pendingDebugNote", ""),
                text,
                textTitle: "完整调试文本（可复制）",
                actions: [
                    {
                        label: "复制全部",
                        primary: true,
                        onClick: (area) => {
                            Utils.copyText(text);
                            if (area) {
                                area.focus();
                                area.select();
                            }
                        }
                    },
                    { label: "关闭", onClick: (area, close) => close() }
                ]
            });
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderPendingDebug);
        else renderPendingDebug();
    }

    const init = () => {
        // 兜底：万一当前环境不支持 GM_addValueChangeListener（面板写入无回调），
        // 至少在下一次唤醒时立刻把面板里的授权码兑换掉，而不是干等它过期
        try {
            const pendingRaw = String(GM_getValue("Config.code", "") || "").trim();
            const pendingCode = Utils.extractAuthCode(pendingRaw);
            if (pendingCode && !API.hasUsableToken() && GM_getValue("Config.codeClaim", "") !== pendingCode) {
                handleConfigCode(pendingRaw).catch(() => {});
            }
        } catch (_) {}
        TaskManager.init();
        const isKeep = GM_getValue("Config.keep", true);
        const checkDone = (enabled, date) => !enabled || date === RewardsAuto.state.dateNowNum;
        const isAllDone = checkDone(GM_getValue("Tasks.sign"), TaskManager.signDate) &&
                          checkDone(GM_getValue("Tasks.read"), TaskManager.readDate) &&
                          checkDone(GM_getValue("Tasks.promos"), TaskManager.promosDate) &&
                          checkDone(GM_getValue("Tasks.search"), TaskManager.searchDate);
        if (!isKeep && isAllDone) {
            Utils.log("💤", "今日任务已全部完成");
            return;
        }
        const delay = Utils.randomRange(5000, 95000);
        Utils.log("⏳", `${delay/1000}秒后启动...`);
        setTimeout(() => {
            TaskManager.runAll().catch(e => Utils.log("🔴", `定时运行失败: ${e.message}`));
        }, delay);
    };

    try {
        // v1.8.1：注释同步——跨日锁定已删除，这里是无条件清理 _EDGE_S，避免 Edge 会话残留导致签到被判定为异地
        if (typeof GM_cookie === "function") {
            GM_cookie("delete", { url: "https://bing.com", name: "_EDGE_S" }, () => {});
        }
    } catch (_) {}

    const isBingSearchPage = typeof location !== "undefined"
        && location.hostname
        && (location.hostname === "www.bing.com" || location.hostname === "cn.bing.com");

    if (isLoginCallback) {
        // 在本页立即兑换授权码：授权码是一次性且短时效的，
        // 等待下一轮定时（最长 20 分钟）大概率已过期
        (async () => {
            // 走与「粘贴授权码」完全相同的兑换路径：内部有 Config.codeClaim 去重，
            // 多个上下文同时看到这个码时只有一个真正去兑换，其余只等结果
            let ok = false;
            try {
                const raw = String(GM_getValue("Config.code", "") || "").trim();
                if (raw) ok = await handleConfigCode(raw);
            } catch (e) {
                ok = false;
            }
            // 码可能被粘贴菜单/定时轮询先消费并由对方完成兑换：
            // 等待至多 10 秒，观察存储中是否出现新凭据
            if (!ok) {
                for (let i = 0; i < 5 && !ok; i++) {
                    await Utils.delay(2000);
                    ok = API.hasUsableToken();
                }
            }
            if (ok) {
                GM_setValue("Config.tokenBackup", false);
                if (GM_getValue("Notice.bro", true)) {
                    try { GM_notification({ title: "🟢 授权成功", text: "Token已获取，可关闭此页" }); } catch(_) {}
                }
                setTimeout(() => { try { window.close(); } catch(_) {} }, 500);
            } else {
                // 新码兑换失败：仅当没有其他有效凭据时，回退暂存的旧 refresh_token
                const hasNewToken = GM_getValue("Config.token", false);
                const hasNewAccess = GM_getValue("Config.accessToken", false)
                    && Number(GM_getValue("Config.accessExpiresAt", 0)) > Date.now();
                if (!hasNewToken && !hasNewAccess) {
                    const backup = GM_getValue("Config.tokenBackup", false);
                    if (backup) GM_setValue("Config.token", backup);
                }
                GM_setValue("Config.tokenBackup", false);
                Utils.log("🔴", "授权码捕获成功但 Token 交换失败，请复制地址栏 URL 到「📋 粘贴授权码」重试，或重新点击「🔑 手动授权」");
            }
        })();
    } else if (!isBingSearchPage) {
        init();
    } else {
        GM_log("⏭️ 当前为 Bing 搜索页，跳过脚本初始化（防止重复执行/打开多余页面）");
    }

})();
