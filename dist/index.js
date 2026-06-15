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
        await ctx.reply("DoochyBot running.");
    });
    bot.command("help", async (ctx) => {
        await ctx.reply("/pause - Stop executing signals\n" +
            "/resume - Resume executing signals\n" +
            "\n" +
            "/symbols - List allowed symbols with lot sizes\n" +
            "/symbols add <sym> - Add symbol\n" +
            "/symbols add all - Add all high-confidence symbols\n" +
            "/symbols remove <sym> - Remove symbol\n" +
            "/symbols reset - Restore default symbol list\n" +
            "/symbols <sym> <lots> - Set per-symbol lot size\n" +
            "\n" +
            "/risk lotsize <lots> - Default lot size (fixed sizing)\n" +
            "/risk risk <usd> - Risk $ per trade: size derived from SL%, bounds each trade's loss (0 = fixed lots)\n" +
            "/risk sl <pct> - Stop loss (% of entry)\n" +
            "/risk tp <pct> - Take profit (% of entry)\n" +
            "/risk maxpos <n> - Max open positions\n" +
            "/risk daily <pct> - Daily loss limit (%)\n" +
            "/risk maxloss <usd> - Max daily loss ($)\n" +
            "/risk cap <usd> - Daily profit cap: force-close all & block signals at this profit (0 = off)\n" +
            "/risk capbuffer <usd> - Close cap_usd - buffer$ early so realized never overshoots cap\n" +
            "/risk losses <n> - SL hits per symbol before cooldown (0 = off)\n" +
            "/risk losswindow <min> - Window for counting SL hits\n" +
            "/risk cooldown <min> - How long a symbol is paused after the streak\n" +
            "\n" +
            "/cooldown - List cooled-down symbols\n" +
            "/cooldown reset [sym] - Clear a symbol's cooldown (or all)\n" +
            "/minhold <secs> - Min hold time before TP is set\n" +
            "\n" +
            "/positions - Open positions: entry, mark, SL, TP, P&L\n" +
            "/closeall - Close all open positions\n" +
            "/export [from] [to] - Export trade history\n" +
            "\n" +
            "/balance - Account balance\n" +
            "/status - Connection health, P&L, cap, cooldowns\n" +
            "\n" +
            "One position per symbol. Opposite signals only flip if confidence is higher.");
    });
    bot.command("pause", pause_1.pauseCmd);
    bot.command("resume", resume_1.resumeCmd);
    bot.command("symbols", symbols_1.symbolsCmd);
    bot.command("risk", risk_1.riskCmd);
    bot.command("minhold", minhold_1.minholdCmd);
    bot.command("closeall", closeall_1.closeallCmd);
    bot.command("export", export_1.exportCmd);
    bot.command("balance", status_1.balanceCmd);
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
    console.log("[BOOT] Ready");
}
main().catch((err) => {
    console.error("[BOOT] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map