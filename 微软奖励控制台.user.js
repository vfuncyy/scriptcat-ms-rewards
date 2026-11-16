// ==UserScript==
// @name         微软奖励控制台
// @namespace    https://rewards.bing.com/
// @version      2.2.0
// @description  Microsoft Rewards 的暗色控制台：运行状态 / 手动授权 / 兑换授权码 / 立即运行 / PushPlus / 诊断信息 / 通知开关 七个菜单项全部是可操作的可视化面板（指标条 + 任务进度 + 表单 + 可复制原文）。需与「微软bing rewards积分获取（持续优化版）」定时脚本配套安装——两者共用 @storageName 共享配置与统计快照，本脚本只负责界面，不单独抓取任何数据。
// @icon         https://bing.com/th?id=OMR.icon-96.png&pid=Rewards
// @license      MIT
// @connect      login.live.com
// @connect      pushplus.plus
// @match        https://rewards.bing.com/*
// @match        https://www.bing.com/*
// @match        https://cn.bing.com/*
// @match        https://login.live.com/oauth20_desktop.srf*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_log
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @storageName  BingRewardsAuto_Shared
// @homepageURL  https://github.com/vfuncyy/scriptcat-ms-rewards
// @supportURL   https://github.com/vfuncyy/scriptcat-ms-rewards/issues
// @updateURL    https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-console.user.js
// @downloadURL  https://github.com/vfuncyy/scriptcat-ms-rewards/releases/latest/download/microsoft-rewards-console.user.js
// @tag          Microsoft Rewards
// @tag          控制台
// @tag          面板
// @tag          脚本猫
// ==/UserScript==

/*
 * 架构说明（v2.2.0 起脚本拆成两个）
 * ------------------------------------------------------------------
 * 1. 定时脚本「微软bing rewards积分获取（持续优化版）」——@crontab，跑在
 *    service_worker，负责全部自动化；它每轮结束把统计快照写进共享存储
 *    （Config.lastStats / Config.lastRunTs / Config.lastDebugInfo ...）。
 * 2. 本文件「微软奖励控制台」——普通页面脚本，跑在 rewards.bing.com 等页面，
 *    只负责把上面那些快照渲染成面板，并提供表单去写配置/兑换授权码。
 * 两者通过 @storageName BingRewardsAuto_Shared 共享同一个 value 库。
 *
 * 为什么必须拆：ScriptCat 的 getParticularScriptList 只把 type === NORMAL 的
 * 脚本注册进页面，@crontab 脚本永远不会被注入网页，因此在网页里
 * attachShadow / document.createElement 之类的 UI 代码根本没有 document 可用。
 */

(function () {
    'use strict';

    const VERSION = (GM_info && GM_info.script && GM_info.script.version) || "2.2.0";
    const AUTH_URL = "https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&response_type=code&scope=service::prod.rewardsplatform.microsoft.com::MBI_SSL&redirect_uri=https://login.live.com/oauth20_desktop.srf";

    /** 与定时脚本同名同结构的最小占位：内核方法只用到这两个字段 */
    const RewardsAuto = {
        ua: {
            pc: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
        },
        state: {
            token: false,
            sendMSG: "",
            dateNowNum: 0
        },
        debugBuffer: [],
        /** _renewToken 用它判定「这一轮是否真的兑换过授权码」 */
        _codeExchanged: false
    };

    /** 与定时脚本同构的 PushPlus 配置读取 */
    const PushPlus = {
        endpoint: "https://www.pushplus.plus/send",

        /**
         * 读取当前生效的推送配置（每次发送都重读，改完面板无需重载）
         * @returns {{enabled:boolean, token:string}} 配置
         */
        read() {
            return {
                enabled: GM_getValue("Notice.pushplus", true) !== false,
                token: String(GM_getValue("Notice.pushplusToken", "") || "").trim()
            };
        },

        /**
         * 是否具备推送条件：开关打开且已填 Token
         * @returns {boolean} 可否推送
         */
        ready() {
            const cfg = this.read();
            return Boolean(cfg.enabled && cfg.token);
        }
    };
    const Utils = {
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
.fields{display:flex;flex-direction:column;gap:11px;padding:12px 14px 4px;}
.field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--pc-muted);}
.field.is-check{flex-direction:row;align-items:center;gap:8px;cursor:pointer;color:var(--pc-fg);font-size:13px;}
.field .lab{letter-spacing:.02em;}
.field .hintline{font-size:11px;line-height:1.5;color:var(--pc-muted);}
.field .field-input{width:100%;font:12px/1.6 var(--pc-mono);color:var(--pc-fg);background:rgba(2,6,23,.55);border:1px solid var(--pc-border);border-radius:6px;padding:7px 9px;}
.field textarea.field-input{height:auto;min-height:64px;resize:vertical;white-space:pre-wrap;word-break:break-all;tab-size:2;}
.field input[type="checkbox"]{width:15px;height:15px;margin:0;accent-color:var(--pc-accent);cursor:pointer;}
.field .field-input::placeholder{color:#64748b;}
.field .field-input:focus-visible{outline:2px solid var(--pc-ring);outline-offset:1px;border-color:var(--pc-ring);}
.note[hidden]{display:none;}
.ft{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--pc-border);background:var(--pc-surface);flex:0 0 auto;}
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
            // 提示条始终挂在 DOM 上：setNote 之后可以重新显示，避免「面板建好才想补提示」无从下手
            if (opts.note) noteEl.textContent = opts.note;
            else noteEl.hidden = true;
            card.append(hd, noteEl, body);
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
            // 表单字段（配置类面板：单行输入 / 密码 / 多行文本 / 开关）
            const fieldsWrap = el("div", "fields");
            /** 字段 key -> 输入元素 */
            const fieldEls = Object.create(null);
            /**
             * 渲染表单字段
             * @param {Array<Object>} fields 字段描述 {type,key,label,value,placeholder,hint,rows}
             */
            const renderFields = (fields) => {
                const list = Array.isArray(fields) ? fields : [];
                Object.keys(fieldEls).forEach((k) => { delete fieldEls[k]; });
                fieldsWrap.textContent = "";
                if (!list.length) { fieldsWrap.remove(); return; }
                list.forEach((field, i) => {
                    const key = String(field.key || `f${i}`);
                    const isCheck = field.type === "checkbox";
                    const row = el("label", isCheck ? "field is-check" : "field");
                    let input;
                    if (isCheck) {
                        input = document.createElement("input");
                        input.type = "checkbox";
                        input.checked = Boolean(field.value);
                    } else if (field.type === "textarea") {
                        input = document.createElement("textarea");
                        input.className = "field-input";
                        input.rows = Number(field.rows) > 0 ? Number(field.rows) : 3;
                        input.value = field.value === undefined || field.value === null ? "" : String(field.value);
                        if (field.placeholder) input.placeholder = String(field.placeholder);
                    } else {
                        input = document.createElement("input");
                        input.type = field.type === "password" ? "password" : "text";
                        input.className = "field-input";
                        input.value = field.value === undefined || field.value === null ? "" : String(field.value);
                        if (field.placeholder) input.placeholder = String(field.placeholder);
                    }
                    if (!isCheck) input.autocomplete = "off";
                    fieldEls[key] = input;
                    const lab = el("span", "lab");
                    lab.textContent = field.label || key;
                    if (isCheck) row.append(input, lab);
                    else row.append(lab, input);
                    if (field.hint) {
                        const tip = el("span", "hintline");
                        tip.textContent = String(field.hint);
                        row.append(tip);
                    }
                    fieldsWrap.append(row);
                });
                // 字段区放在滚动区顶部；若已有任务行，插在行区上方
                if (!fieldsWrap.isConnected) {
                    if (rowsWrap.isConnected) body.insertBefore(fieldsWrap, rowsWrap);
                    else body.insertBefore(fieldsWrap, body.firstChild);
                }
            };
            if (Array.isArray(opts.fields)) renderFields(opts.fields);
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
                    // 字段区优先：任务行永远排在表单字段之后
                    if (fieldsWrap.isConnected) body.insertBefore(rowsWrap, fieldsWrap.nextSibling);
                    else body.insertBefore(rowsWrap, body.firstChild);
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
                btn.onclick = () => {
                    if (!action.onClick) { close(); return; }
                    try {
                        const ret = action.onClick(area, close, fieldApi);
                        // 允许 action 写成 async：异常统一落到提示条，不让它变成未处理拒绝
                        if (ret && typeof ret.catch === "function") ret.catch((e) => fieldApi.setNote(`⚠️ ${e.message}`));
                    } catch (e) {
                        fieldApi.setNote(`⚠️ ${e.message}`);
                    }
                };
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
            /** 面板内部 API：按钮回调读写字段与提示条，避免每个入口各查一遍 DOM */
            const fieldApi = {
                /**
                 * 读取全部字段当前值
                 * @returns {Object} key -> string|boolean
                 */
                values: () => {
                    const out = {};
                    Object.keys(fieldEls).forEach((k) => {
                        const input = fieldEls[k];
                        if (!input) return;
                        out[k] = input.type === "checkbox" ? input.checked : input.value;
                    });
                    return out;
                },
                /**
                 * 设置单个字段值
                 * @param {string} key 字段名
                 * @param {string|boolean} value 新值
                 */
                setValue: (key, value) => {
                    const input = fieldEls[key];
                    if (!input) return;
                    if (input.type === "checkbox") input.checked = Boolean(value);
                    else input.value = value === undefined || value === null ? "" : String(value);
                },
                /**
                 * 聚焦指定字段
                 * @param {string} key 字段名
                 */
                focusField: (key) => {
                    const input = fieldEls[key];
                    if (input && typeof input.focus === "function") input.focus();
                },
                setNote: (text) => {
                    const str = text === undefined || text === null ? "" : String(text);
                    noteEl.textContent = str;
                    noteEl.hidden = !str;
                },
                setFields: (fields) => { renderFields(fields); },
                close: () => close()
            };
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
                    // 指标条必须挂在滚动区之外（card 直接子节点），否则滚动任务行时数值会滚走
                    if (!statsEl.isConnected && card.contains(body)) card.insertBefore(statsEl, body);
                },
                setNote: (text) => {
                    const str = text === undefined || text === null ? "" : String(text);
                    noteEl.textContent = str;
                    noteEl.hidden = !str;
                },
                setFields: (fields) => { renderFields(fields); },
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
    };
    const API = {
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
    };

    /** 存储里是否有可用凭据（refresh_token 或未过期的 access_token） */
    const tokenReady = () => {
        if (GM_getValue("Config.token", false)) return true;
        const access = GM_getValue("Config.accessToken", false);
        return Boolean(access && Number(GM_getValue("Config.accessExpiresAt", 0)) > Date.now());
    };

    /**
     * 把时间戳渲染成「X天Y小时 / Y小时Z分钟 / Z分钟」
     * @param {number} ts 毫秒时间戳（0 表示没有）
     * @returns {string} 人类可读时长
     */
    const ageText = (ts) => {
        if (!ts) return "—";
        const diff = Math.max(0, Date.now() - Number(ts));
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        if (d > 0) return `${d}天${h}小时`;
        if (h > 0) return `${h}小时${m}分钟`;
        return `${m}分钟`;
    };

    /** 本地化时间字符串 */
    const fmtTime = (ts) => (ts ? new Date(Number(ts)).toLocaleString("zh-CN") : "—");

    /** 读取定时脚本写入的统计快照 {t, stats, report} */
    const readSnapshot = () => {
        const snap = GM_getValue("Config.lastStats", null);
        if (!snap || !snap.stats) return null;
        return snap;
    };

    /** 菜单注册表：既挂到 ScriptCat 菜单，也供后台菜单请求（Config.openPanel）复用 */
    const PANELS = Object.create(null);
    const menu = (key, label, fn) => {
        PANELS[key] = fn;
        GM_registerMenuCommand(label, fn);
    };

    /**
     * 兑换一次授权码并返回结构化结果
     * @param {string} code 微软 OAuth 授权码
     * @returns {Promise<{ok:boolean,concurrentOk:boolean,hint:string}>} ok=本上下文成功；concurrentOk=其他上下文已成功
     */
    async function exchangeAuthCode(code) {
        const startedAt = Utils.getTimestamp();
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
            if (!errIsOwn && !API.hasUsableToken()) {
                await Utils.delay(2000);
                try { ok = await API.renewToken(true, code); } catch (_) {}
            }
        }
        const tokenAfter = GM_getValue("Config.token", false);
        const accessAfter = GM_getValue("Config.accessToken", false);
        const concurrentOk = Boolean(
            (tokenAfter && tokenAfter !== tokenBefore)
            || (accessAfter && accessAfter !== accessBefore
                && Number(GM_getValue("Config.accessExpiresAt", 0)) > Date.now())
        );
        const lastErr = GM_getValue("Config.lastTokenError", null);
        const hint = (lastErr && Number(lastErr.t || 0) >= startedAt)
            ? `（最近错误: ${lastErr.grant} → ${lastErr.error} ${lastErr.description || ""}）`
            : "（本轮没有产生新的授权错误）";
        return { ok, concurrentOk, hint };
    }

    /**
     * 用 Config.codeClaim 去重后兑换（避免多个上下文抢一个一次性授权码）
     * @param {string} raw 完整跳转 URL 或裸授权码
     * @returns {Promise<boolean>} 是否已获得可用凭据
     */
    async function handleConfigCode(raw) {
        const code = Utils.extractAuthCode(raw);
        if (!code) return false;
        if (GM_getValue("Config.codeClaim", "") === code) return false;
        const claimId = Utils.getRandomUUID();
        GM_setValue("Config.codeClaim", code);
        GM_setValue("Config.codeClaimBy", claimId);
        await Utils.delay(150);
        if (GM_getValue("Config.codeClaimBy", "") !== claimId) return false;
        const res = await exchangeAuthCode(code);
        if (res.ok || res.concurrentOk) {
            if (String(GM_getValue("Config.code", "") || "").trim() === String(raw || "").trim()) {
                GM_setValue("Config.code", "");
            }
            return true;
        }
        return false;
    }

    // ===== 菜单：🔑 手动授权 =====
    menu("auth", "🔑 手动授权", () => {
        Utils.showPanel({
            title: "手动授权",
            meta: `v${VERSION}`,
            note: "登录并同意后，地址栏会跳到 oauth20_desktop.srf?code=... 的地址；把那整段地址复制出来，再用「📋 粘贴/兑换授权码」兑换成 Token",
            logTitle: "步骤",
            log: [
                "1  打开授权页面，登录自己的微软账号",
                "2  同意 Rewards 授权，等地址栏跳到 oauth20_desktop.srf?code=...",
                "3  复制整段地址（或只复制 code= 后面那段）",
                "4  回到本页面 → 菜单「📋 粘贴/兑换授权码」粘贴并兑换"
            ],
            text: AUTH_URL,
            textTitle: "授权链接（可复制）",
            actions: [
                {
                    label: "打开授权页面",
                    primary: true,
                    onClick: (area, close) => {
                        GM_openInTab(AUTH_URL, { active: true });
                        close();
                    }
                },
                {
                    label: "复制链接",
                    onClick: (area, close, api) => {
                        const ok = Utils.copyText(AUTH_URL);
                        api.setNote(ok ? "✅ 授权链接已复制，粘贴到浏览器地址栏即可" : "⚠️ 复制失败，请展开下方文本框手动选中复制");
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    // ===== 菜单：📋 粘贴/兑换授权码 =====
    menu("code", "📋 粘贴/兑换授权码", () => {
        const savedRaw = String(GM_getValue("Config.code", "") || "").trim();
        Utils.showPanel({
            title: "兑换授权码",
            meta: `v${VERSION}`,
            note: tokenReady()
                ? "当前已有可用凭据；要换号或续期，粘贴新的授权码后点「兑换」即可覆盖"
                : "当前没有可用凭据：先用「🔑 手动授权」拿到授权码，再粘贴到这里",
            fields: [
                {
                    type: "textarea",
                    key: "code",
                    label: "授权页面跳转后的完整网址 / 授权码",
                    rows: 4,
                    placeholder: "https://login.live.com/oauth20_desktop.srf?code=M.C5_BAY...",
                    hint: savedRaw ? "留空 = 使用存储里已保存的授权码链接" : "留空且存储为空时会提示先获取授权码"
                }
            ],
            actions: [
                {
                    label: "兑换",
                    primary: true,
                    onClick: async (area, close, api) => {
                        const typed = String(api.values().code || "").trim();
                        const raw = typed || savedRaw;
                        if (!raw) return api.setNote("⚠️ 还没有授权码：先点「🔑 手动授权」打开授权页面");
                        const code = Utils.extractAuthCode(raw);
                        if (!code) return api.setNote("⚠️ 没识别出授权码，请确认复制的是 oauth20_desktop.srf?code=... 整段地址");
                        api.setNote("⏳ 正在兑换 Token，请稍候…");
                        const res = await exchangeAuthCode(code);
                        if (res.ok || res.concurrentOk) {
                            GM_setValue("Config.code", "");
                            api.setNote(res.ok ? "🎉 Token 获取成功，授权已完成" : "🎉 Token 已由其他上下文获取成功，授权已完成");
                        } else {
                            api.setNote(`⚠️ Token 获取失败${res.hint}\n请重新点「🔑 手动授权」并粘贴最新的跳转网址`);
                        }
                    }
                },
                {
                    label: "清空输入",
                    onClick: (area, close, api) => {
                        api.setValue("code", "");
                        api.focusField("code");
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    // ===== 菜单：📊 运行状态 =====
    menu("status", "📊 运行状态", () => {
        const snap = readSnapshot();
        const model = Utils.buildPanelModel(snap ? snap.stats : null, { tokenReady: tokenReady() });
        const refreshTs = Number(GM_getValue("Config.tokenTime", 0));
        const accessExp = Number(GM_getValue("Config.accessExpiresAt", 0));
        const access = GM_getValue("Config.accessToken", false);
        const lastErr = GM_getValue("Config.lastTokenError", null);
        const pushCfg = PushPlus.read();
        const broOn = GM_getValue("Notice.bro", true) !== false;
        const lastRun = Number(GM_getValue("Config.lastRunTs", 0));
        const runReq = Number(GM_getValue("Config.runRequest", 0));

        const log = [
            `凭据      ${tokenReady() ? "可用" : "缺失，需先授权"}`,
            `续期时间  ${refreshTs ? fmtTime(refreshTs) + "（" + ageText(refreshTs) + "前）" : "—"}`,
            `访问令牌  ${access ? (accessExp > Date.now() ? "有效，还剩 " + ageText(accessExp) : "已过期") : "—"}`,
            `最近轮次  ${lastRun ? fmtTime(lastRun) + "（" + ageText(lastRun) + "前）" : "尚未运行"}`,
            `统计快照  ${snap ? fmtTime(snap.t) : "暂无（等定时脚本跑完一轮）"}`,
            `推送目标  ${PushPlus.ready() ? "PushPlus（微信）+ 浏览器通知" : (pushCfg.token ? "仅浏览器通知（PushPlus 已关闭）" : "仅浏览器通知（未配 Token）")}`,
            `浏览器通知 ${broOn ? "开启" : "关闭"}`,
            lastErr ? `最近错误  ${lastErr.grant} → ${lastErr.error} ${lastErr.description || ""}` : "最近错误  无",
            runReq ? `待执行    已排队，等下一轮定时（${ageText(runReq)}前提交）` : "待执行    无"
        ];

        const plainText = [
            "=== 微软奖励 · 运行状态 ===",
            ...log,
            "",
            "=== 任务进度 ===",
            ...(snap && snap.report ? String(snap.report).split("\n") : ["（暂无，等定时脚本跑完一轮）"])
        ].join("\n");

        const panel = Utils.showPanel({
            title: "运行状态",
            meta: `v${VERSION}`,
            stats: model.stats,
            rows: model.rows,
            rowsTitle: "任务进度",
            logTitle: "账号与推送",
            log,
            text: plainText,
            textTitle: "纯文本（可复制）",
            actions: [
                {
                    label: "刷新",
                    primary: true,
                    onClick: (area, close, api) => {
                        const s2 = readSnapshot();
                        const m2 = Utils.buildPanelModel(s2 ? s2.stats : null, { tokenReady: tokenReady() });
                        panel.setStats(m2.stats);
                        panel.setRows(m2.rows);
                        api.setNote(s2
                            ? `✅ 已刷新（快照 ${fmtTime(s2.t)}）`
                            : "⚠️ 还没有快照：定时脚本跑完一轮后这里才有数据");
                    }
                },
                {
                    label: "立即运行",
                    onClick: (area, close) => {
                        GM_setValue("Config.runRequest", Date.now());
                        close();
                        try {
                            GM_notification({
                                title: GM_info.script.name,
                                text: "已排队：下一轮定时（≤20 分钟）会立刻执行一轮完整任务"
                            });
                        } catch (_) {}
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
        if (!panel) {
            GM_setValue("Config.runRequest", Date.now());
        }
    });

    // ===== 菜单：🚀 立即运行 =====
    menu("run", "🚀 立即运行", () => {
        const runReq = Number(GM_getValue("Config.runRequest", 0));
        Utils.showPanel({
            title: "立即运行",
            meta: `v${VERSION}`,
            note: "定时脚本由 ScriptCat 调度，网页脚本无法直接唤起它；这里写入一个「尽快执行」标记，下一轮定时（≤20 分钟）会优先跑完整任务。要真正立刻执行，可到 ScriptCat 扩展面板对这个定时脚本点「运行一次」。",
            logTitle: "本轮顺序",
            log: [
                "1  预检 · 地区与 Token",
                "2  签到（PC / App）",
                "3  阅读 · PC 搜索",
                "4  活动卡片 · 任务卡 · 每日活动",
                "5  连签检测 · 待领取积分 · 日报推送",
                runReq
                    ? `当前排队请求提交于 ${fmtTime(runReq)}（${ageText(runReq)}前）`
                    : "当前没有排队的请求"
            ],
            actions: [
                {
                    label: "排队执行",
                    primary: true,
                    onClick: (area, close, api) => {
                        GM_setValue("Config.runRequest", Date.now());
                        api.setNote("✅ 已排队：下一轮定时（≤20 分钟）会立刻执行一轮完整任务");
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    /**
     * 发一条测试通知
     * @returns {string[]} 每个渠道一行结果说明
     */
    function sendTestNotification() {
        const testText = "🧪 这是一条测试消息\n如果你看到这条消息，说明通知接口配置成功！";
        RewardsAuto.state.sendMSG = testText;
        GM_log("📢 " + testText);
        const out = [];
        if (GM_getValue("Notice.bro", true) !== false) {
            try { GM_notification({ title: GM_info.script.name, text: testText }); } catch (_) {}
            out.push("浏览器通知: 已发送");
        } else {
            out.push("浏览器通知: 已关闭");
        }
        if (PushPlus.ready()) {
            Utils.sendPushPlus().catch(() => {});
            out.push("PushPlus 微信推送: 已发送（结果见脚本日志）");
        } else {
            out.push(PushPlus.read().token ? "PushPlus 微信推送: 已关闭" : "PushPlus 微信推送: 未配置 Token");
        }
        return out;
    }

    // ===== 菜单：🔔 配置 PushPlus 推送 =====
    menu("pushplus", "🔔 配置 PushPlus 推送", () => {
        const summary = () => {
            const now = PushPlus.read();
            return `${now.token ? "Token 已配置" : "尚未配置 Token（微信扫码登录 pushplus.plus，首页即可获取）"} · 推送${now.enabled ? "已开启" : "已关闭"} · 实际推送目标 ${PushPlus.ready() ? "PushPlus（微信）+ 浏览器通知" : "仅浏览器通知"}`;
        };
        const cfg = PushPlus.read();
        Utils.showPanel({
            title: "PushPlus 推送",
            meta: `v${VERSION}`,
            note: summary(),
            fields: [
                {
                    type: "checkbox",
                    key: "enabled",
                    label: "开启 PushPlus 微信推送",
                    value: cfg.enabled
                },
                {
                    type: "password",
                    key: "token",
                    label: "PushPlus Token",
                    value: cfg.token,
                    placeholder: "粘贴 pushplus.plus 首页的 token",
                    hint: "留空保存 = 清除 Token，只保留浏览器通知"
                }
            ],
            actions: [
                {
                    label: "保存",
                    primary: true,
                    onClick: (area, close, api) => {
                        const v = api.values();
                        GM_setValue("Notice.pushplus", Boolean(v.enabled));
                        GM_setValue("Notice.pushplusToken", String(v.token || "").trim());
                        api.setNote(`✅ 已保存 · ${summary()}`);
                    }
                },
                {
                    label: "发送测试",
                    onClick: (area, close, api) => {
                        const v = api.values();
                        GM_setValue("Notice.pushplus", Boolean(v.enabled));
                        GM_setValue("Notice.pushplusToken", String(v.token || "").trim());
                        api.setNote(`📢 测试消息已发出 · ${sendTestNotification().join(" · ")}`);
                    }
                },
                {
                    label: "清空 Token",
                    onClick: (area, close, api) => {
                        api.setValue("token", "");
                        GM_setValue("Notice.pushplusToken", "");
                        api.setNote("🧹 已清空 Token，只保留浏览器通知");
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    // ===== 菜单：🔧 诊断信息 =====
    menu("diag", "🔧 诊断信息", () => {
        const snap = readSnapshot();
        const debugText = String(GM_getValue("Config.lastDebugInfo", "") || "").trim();
        const model = Utils.buildPanelModel(snap ? snap.stats : null, { tokenReady: tokenReady() });
        const lines = [
            `统计快照  ${snap ? fmtTime(snap.t) + "（" + ageText(snap.t) + "前）" : "暂无"}`,
            `调试文本  ${debugText ? debugText.length + " 字符" : "暂无"}`,
            `写入时间  ${fmtTime(Number(GM_getValue("Config.lastDebugInfoAt", 0)))}`,
            `控制台版本 v${VERSION}`,
            `当前页面  ${typeof location !== "undefined" ? location.href : "—"}`,
            `页面调试  ${RewardsAuto.debugBuffer.length} 条（本页面缓冲）`,
            "",
            "诊断数据由定时脚本每轮采集后写进共享存储，这里只做展示；要最新数据请等下一轮定时跑完。"
        ];
        const body = debugText
            || (snap && snap.report ? String(snap.report) : "")
            || "（暂无调试文本：定时脚本跑完一轮后会自动写入）";
        Utils.showPanel({
            title: "诊断信息",
            meta: `v${VERSION}`,
            stats: model.stats,
            rows: model.rows,
            rowsTitle: "任务进度",
            logTitle: "快照状态",
            log: lines,
            text: body,
            textTitle: "调试文本（可复制）",
            actions: [
                {
                    label: "复制全部",
                    primary: true,
                    onClick: (area, close, api) => {
                        const ok = Utils.copyText(area ? area.value : body);
                        api.setNote(ok ? "✅ 已复制到剪贴板" : "⚠️ 复制失败，请展开下方文本框手动选中复制");
                        if (area) { area.focus(); area.select(); }
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    // ===== 菜单：浏览器通知开关 =====
    /** 菜单文案随开关状态变化 */
    const updateBroMenu = () => {
        const enabled = GM_getValue("Notice.bro", true) !== false;
        return enabled ? "🔕 关闭浏览器通知" : "🔔 开启浏览器通知";
    };

    menu("bro", updateBroMenu(), () => {
        const enabled = GM_getValue("Notice.bro", true) !== false;
        Utils.showPanel({
            title: "通知设置",
            meta: `v${VERSION}`,
            note: "浏览器通知用于任务完成 / 异常提醒；关掉之后仍然可以只看日志与面板",
            fields: [
                {
                    type: "checkbox",
                    key: "bro",
                    label: "浏览器通知（任务完成 / 异常提醒）",
                    value: enabled
                }
            ],
            actions: [
                {
                    label: "保存并刷新",
                    primary: true,
                    onClick: (area, close, api) => {
                        GM_setValue("Notice.bro", Boolean(api.values().bro));
                        close();
                        try { location.reload(); } catch (_) {}
                    }
                },
                { label: "关闭", onClick: (area, close) => close() }
            ]
        });
    });

    // ===== 跨上下文：定时脚本捕获的授权码到来时自动兑换 =====
    try {
        GM_addValueChangeListener("Config.code", (key, oldVal, newVal) => {
            const raw = String(newVal || "").trim();
            if (!raw || raw === String(oldVal || "").trim()) return;
            if (!Utils.extractAuthCode(raw)) return;
            if (tokenReady() && GM_getValue("Config.codeClaim", "") === Utils.extractAuthCode(raw)) return;
            setTimeout(() => {
                handleConfigCode(raw).then((ok) => {
                    Utils.log(ok ? "🟢" : "🔴", ok ? "跨上下文授权码兑换成功" : "跨上下文授权码兑换失败，可用「📋 粘贴/兑换授权码」重试");
                });
            }, 800);
        });
    } catch (_) {}

    /**
     * 授权回调页（login.live.com/oauth20_desktop.srf?code=...）就地兑换，
     * 免去用户手工复制地址这一步。
     */
    function handleCallbackPage() {
        if (typeof location === "undefined") return false;
        if (location.hostname !== "login.live.com" || location.pathname !== "/oauth20_desktop.srf") return false;
        const params = new URLSearchParams(location.search);
        const code = params.get("code");
        if (!code) return false;
        GM_setValue("Config.code", location.href);
        GM_setValue("Config.codeClaim", "");
        try { GM_notification({ title: "🟢 已捕获授权码", text: "正在换取 Token，请稍候…" }); } catch (_) {}
        handleConfigCode(location.href).then((ok) => {
            const nowOk = ok || tokenReady();
            Utils.showPanel({
                title: nowOk ? "授权成功" : "授权失败",
                meta: `v${VERSION}`,
                note: nowOk
                    ? "Token 已写入共享存储，定时脚本下一轮就能直接用，可以关掉这个页面了"
                    : "没有换到 Token；请把地址栏整段复制，回到 rewards.bing.com 用「📋 粘贴/兑换授权码」重试",
                logTitle: "结果",
                log: [
                    `本次兑换  ${ok ? "成功" : "未成功"}`,
                    `凭据状态  ${tokenReady() ? "可用" : "缺失"}`,
                    `当前地址  ${location.href.slice(0, 120)}${location.href.length > 120 ? "…" : ""}`
                ],
                text: location.href,
                textTitle: "当前地址（可复制）",
                actions: [
                    {
                        label: "复制地址",
                        primary: true,
                        onClick: (area, close, api) => {
                            const okCopy = Utils.copyText(location.href);
                            api.setNote(okCopy ? "✅ 地址已复制，回到 rewards.bing.com 粘贴" : "⚠️ 复制失败，请展开文本框手动选中复制");
                        }
                    },
                    {
                        label: "关闭页面",
                        onClick: (area, close) => {
                            close();
                            try { window.close(); } catch (_) {}
                        }
                    }
                ]
            });
        });
        return true;
    }

    // ===== 后台菜单请求：定时脚本的菜单点了之后，由这里代开面板 =====
    /**
     * 消费 Config.openPanel 请求（定时脚本菜单在无 DOM 环境被点击时写入）。
     * 请求形如 {key:"status"|"auth"|"code"|"run"|"pushplus"|"diag"|"bro", t:毫秒}，
     * 15 秒内视为有效，消费后立即清空避免重复弹出。
     */
    function consumeOpenRequest() {
        const req = GM_getValue("Config.openPanel", null);
        if (!req || !req.key) return false;
        const age = Date.now() - Number(req.t || 0);
        GM_setValue("Config.openPanel", null);
        if (age > 15000) return false;
        const fn = PANELS[req.key];
        if (!fn) return false;
        try { fn(); } catch (e) { Utils.log("🔴", `打开面板失败: ${e.message}`); }
        return true;
    }

    try {
        GM_addValueChangeListener("Config.openPanel", (key, oldVal, newVal) => {
            if (!newVal || !newVal.key) return;
            setTimeout(consumeOpenRequest, 120);
        });
    } catch (_) {}

    // ===== 调试入口：在页面控制台里手动触发任意面板，便于排障（不参与正常流程） =====
    try {
        const hookTarget = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
        hookTarget.__MSREWARDS__ = {
            VERSION,
            PANELS,
            Utils,
            API,
            readSnapshot,
            keys: Object.keys(PANELS),
            open: (key) => {
                const fn = PANELS[key];
                if (!fn) return false;
                fn();
                return true;
            }
        };
    } catch (_) {}

    if (!handleCallbackPage()) {
        consumeOpenRequest();
        GM_log(`🟢 微软奖励控制台 v${VERSION} 已就绪（${typeof location !== "undefined" ? location.hostname : "?"}）`);
    }
})();
