"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const grammy_1 = require("grammy");
const ctrader_layer_1 = require("@reiryoku/ctrader-layer");
const poller_1 = require("./signals/poller");
const state_1 = require("./state");
const gate_1 = require("./risk/gate");
const pause_1 = require("./bot/commands/pause");
const resume_1 = require("./bot/commands/resume");
const symbols_1 = require("./bot/commands/symbols");
const risk_1 = require("./bot/commands/risk");
const minhold_1 = require("./bot/commands/minhold");
const closeall_1 = require("./bot/commands/closeall");
const export_1 = require("./bot/commands/export");
const status_1 = require("./bot/commands/status");
const cooldown_1 = require("./bot/commands/cooldown");
const positions_1 = require("./bot/commands/positions");
const account_1 = require("./ctrader/account");
const dailyLoss_1 = require("./risk/dailyLoss");
const symbols_2 = require("./ctrader/symbols");
const orders_1 = require("./ctrader/orders");
const livePrices_1 = require("./ctrader/livePrices");
const amend_1 = require("./ctrader/amend");
const midnightClose_1 = require("./risk/midnightClose");
const dailyLoss_2 = require("./risk/dailyLoss");
const capMonitor_1 = require("./risk/capMonitor");
const lossMonitor_1 = require("./risk/lossMonitor");
const notify_1 = require("./bot/notify");
const webhook_1 = require("./webhook");
dotenv_1.default.config();
const config = {
    ctrader: {
        host: process.env.CTRADER_HOST || "demo.ctraderapi.com",
        port: parseInt(process.env.CTRADER_PORT || "5035"),
        clientId: process.env.CLIENT_ID || "",
        clientSecret: process.env.CLIENT_SECRET || "",
        accessToken: process.env.ACCESS_TOKEN || "",
        refreshToken: process.env.REFRESH_TOKEN || "",
        accountId: process.env.ACCOUNT_ID || "",
    },
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN || "",
        allowedUsers: (process.env.ALLOWED_USERS || "").split(",").map(Number),
    },
};
async function connectCtrader() {
    const connection = new ctrader_layer_1.CTraderConnection({
        host: config.ctrader.host,
        port: config.ctrader.port,
    });
    await connection.open();
    console.log("[CTRADER] Socket opened");
    await connection.sendCommand("ProtoOAApplicationAuthReq", {
        clientId: config.ctrader.clientId,
        clientSecret: config.ctrader.clientSecret,
    });
    console.log("[CTRADER] Application authenticated");
    const accountAuthRes = await connection.sendCommand("ProtoOAAccountAuthReq", {
        ctidTraderAccountId: parseInt(config.ctrader.accountId),
        accessToken: config.ctrader.accessToken,
    });
    console.log("[CTRADER] Account auth response:", JSON.stringify(accountAuthRes).substring(0, 200));
    console.log("[CTRADER] Account authenticated");
    connection.on("close", () => {
        console.log("[CTRADER] Connection closed");
    });
    // cTrader Open API drops the push channel (execution events stop arriving)
    // if no message is sent for ~10s. Keep it alive with a heartbeat.
    setInterval(() => {
        connection.sendHeartbeat();
    }, 10_000);
    console.log("[CTRADER] Heartbeat started (10s)");
    return connection;
}
async function startBot() {
    const bot = new grammy_1.Bot(config.telegram.token);
    (0, notify_1.setNotifier)(bot, config.telegram.allowedUsers);
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        if (userId && config.telegram.allowedUsers.length > 0) {
            if (!config.telegram.allowedUsers.includes(userId)) {
                await ctx.reply("Unauthorized");
                return;
            }
        }
        await next();
    });
    bot.command("start", async (ctx) => {
        await ctx.reply("DoochyBot running.\nNew here? Send /guide to set up trading, or /help for all commands.");
    });
    bot.command("guide", async (ctx) => {
        await ctx.reply("HOW TO START TRADING\n" +
            "\n" +
            "1. Set your risk per trade (REQUIRED)\n" +
            "Nothing trades until this is set. It is the max $ you lose if a trade's stop is hit; the bot sizes every position to match.\n" +
            "   /risk pertrade 50\n" +
            "\n" +
            "2. Set your stop and target (sensible defaults already on)\n" +
            "SL = where the stop sits (% from entry); it also drives trade size together with pertrade. TP = where the target sits.\n" +
            "   /risk sl 0.5\n" +
            "   /risk tp 0.75\n" +
            "\n" +
            "3. Choose which symbols to trade\n" +
            "   /symbols  (show current list)\n" +
            "   /symbols add XAUUSD\n" +
            "\n" +
            "4. Set daily safety limits (recommended)\n" +
            "Each one force-closes everything and stops trading for the day when hit.\n" +
            "   /risk maxloss 200  (daily loss limit)\n" +
            "   /risk cap 300      (daily profit cap, 0 = off)\n" +
            "\n" +
            "5. Confirm it is live\n" +
            "   /resume  (only if you previously paused)\n" +
            "   /status  (Sizing should show your $ risk, not 'not set')\n" +
            "\n" +
            "Done. Signals will now execute. See /help for the full command list.");
    });
    bot.command("help", async (ctx) => {
        await ctx.reply("• CONTROL\n" +
            "/pause: stop executing signals\n" +
            "/resume: resume executing signals\n" +
            "\n" +
            "• SYMBOLS\n" +
            "/symbols: list allowed symbols\n" +
            "/symbols add <sym>: add a symbol\n" +
            "/symbols add all: add all high confidence symbols\n" +
            "/symbols remove <sym>: remove a symbol\n" +
            "/symbols reset: restore default list\n" +
            "\n" +
            "• SIZING (how big each trade is)\n" +
            "/risk pertrade <usd>: max $ you lose if a trade's stop is hit; the bot sizes the lots to match (0 = trading off)\n" +
            "\n" +
            "• STOP / TARGET\n" +
            "/risk sl <pct>: where the stop sits, as % from entry. Also drives size (with pertrade): tighter stop = bigger trade.\n" +
            "/risk tp <pct>: where the target sits, as % from entry.\n" +
            "Note: channel signals carry their own SL/TP, which override these %s.\n" +
            "/minhold <secs>: min hold before TP arms\n" +
            "\n" +
            "• DAILY LIMITS (both force close ALL positions + stop for the day)\n" +
            "/risk maxloss <usd>: daily loss limit\n" +
            "/risk cap <usd>: daily profit cap (0 = off)\n" +
            "/risk capbuffer <usd>: trigger cap this many $ early\n" +
            "/risk maxpos <n>: max concurrent positions\n" +
            "\n" +
            "• COOLDOWN (per symbol loss streak)\n" +
            "/risk losses <n>: SL hits before cooldown (0 = off)\n" +
            "/risk losswindow <min>: window to count hits\n" +
            "/risk cooldown <min>: pause length\n" +
            "/cooldown: list cooled down symbols\n" +
            "/cooldown reset [sym]: clear a cooldown (or all)\n" +
            "\n" +
            "• POSITIONS & INFO\n" +
            "/status: connection, P&L, limits, sizing, cooldowns\n" +
            "/positions: open positions: entry, mark, SL, TP, P&L\n" +
            "/closeall: close all open positions\n" +
            "\n" +
            "/export [from] [to]: export trade history\n" +
            "\n" +
            "Notes: trade size comes from pertrade + the SL %. One position per symbol. Opposite signals flip only on higher confidence.");
    });
    bot.command("pause", pause_1.pauseCmd);
    bot.command("resume", resume_1.resumeCmd);
    bot.command("symbols", symbols_1.symbolsCmd);
    bot.command("risk", risk_1.riskCmd);
    bot.command("minhold", minhold_1.minholdCmd);
    bot.command("closeall", closeall_1.closeallCmd);
    bot.command("export", export_1.exportCmd);
    bot.command("status", status_1.statusCmd);
    bot.command("cooldown", cooldown_1.cooldownCmd);
    bot.command("positions", positions_1.positionsCmd);
    bot.start({
        drop_pending_updates: true,
        onStart: () => console.log("[TELEGRAM] Bot started"),
    });
}
async function main() {
    console.log("[BOOT] Starting DoochyBot...");
    (0, state_1.initSettings)();
    const ctrader = await connectCtrader();
    (0, orders_1.setConnection)(ctrader);
    (0, livePrices_1.setLivePriceConnection)(ctrader);
    (0, amend_1.setAmendConnection)(ctrader);
    (0, midnightClose_1.setMidnightConnection)(ctrader);
    (0, export_1.setExportConnection)(ctrader);
    (0, status_1.setStatusConnection)(ctrader);
    (0, midnightClose_1.startMidnightCheck)();
    (0, dailyLoss_2.startDailyReset)();
    (0, capMonitor_1.startCapMonitor)();
    (0, lossMonitor_1.startLossMonitor)();
    console.log("[SAFETY] Midnight closer, daily reset, and loss monitor active");
    await (0, account_1.fetchAccountInfo)(ctrader);
    await (0, symbols_2.fetchSymbols)(ctrader);
    // Pre-subscribe spot streams for every allowed symbol so a live quote is already
    // flowing before the first signal arrives. Without this, the first trade on a
    // symbol has no mark price and risk-based sizing can't size against it.
    const allowedSymbolIds = [...new Set(state_1.state.settings.allowedSymbols
            .map((s) => state_1.state.symbolMap.get(s) ?? state_1.state.symbolMap.get(s.replace(/USD$/, "")))
            .filter((id) => id !== undefined))];
    await (0, livePrices_1.subscribeSpots)(allowedSymbolIds);
    console.log(`[BOOT] Pre-subscribed spots for ${allowedSymbolIds.length} allowed symbol(s)`);
    // Seed today's realized P&L from the broker BEFORE reconciling positions. This
    // order is critical: reconcilePositions() re-arms TPs on positions opened before
    // the restart, and the cap-TP logic in amend.ts only applies when dailyPnLSeeded
    // is true. Seeding first means re-armed TPs are correctly capped to the remaining
    // headroom instead of a full normal TP that could blow past the cap. Retry once;
    // if both attempts fail, daily limits are disabled rather than run against a false 0.
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            state_1.state.dailyRealizedPnL = await (0, account_1.fetchTodayRealizedPnL)(ctrader);
            state_1.state.dailyPnLSeeded = true;
            console.log(`[PNL] Seeded today's realized P&L: ${state_1.state.dailyRealizedPnL.toFixed(2)}`);
            break;
        }
        catch (err) {
            console.warn(`[PNL] Seed attempt ${attempt} failed: ${err.errorCode || err.message || "request failed"}`);
            if (attempt === 2) {
                console.warn("[PNL] Daily loss/profit limits DISABLED this session — could not read today's P&L from broker.");
            }
        }
    }
    await (0, orders_1.reconcilePositions)();
    // Start streaming live prices for any position we already hold so floating P&L
    // and the profit cap are accurate immediately, not just after the next signal.
    await (0, livePrices_1.subscribeOpenPositions)();
    (0, dailyLoss_1.evaluateDailyLimits)(false);
    await startBot();
    (0, poller_1.startPoller)((signal) => {
        (0, gate_1.processSignal)(signal);
    });
    (0, webhook_1.startWebhookServer)();
    console.log("[BOOT] Ready");
}
main().catch((err) => {
    console.error("[BOOT] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map