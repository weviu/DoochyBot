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
const account_1 = require("./ctrader/account");
const dailyLoss_1 = require("./risk/dailyLoss");
const symbols_2 = require("./ctrader/symbols");
const orders_1 = require("./ctrader/orders");
const amend_1 = require("./ctrader/amend");
const midnightClose_1 = require("./risk/midnightClose");
const dailyLoss_2 = require("./risk/dailyLoss");
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
            "/symbols - List allowed symbols\n" +
            "/symbols add <sym> - Add symbol\n" +
            "/symbols add all - Add all high-confidence symbols\n" +
            "/symbols remove <sym> - Remove symbol\n" +
            "/symbols reset - Restore default symbol list\n" +
            "/symbols <sym> <lots> - Set lot size for symbol\n" +
            "\n" +
            "/risk lotsize <lots> - Set default lot size\n" +
            "/risk sl <pct> - Set stop loss (% of entry)\n" +
            "/risk tp <pct> - Set take profit (% of entry)\n" +
            "/risk maxpos <n> - Set max open positions\n" +
            "/risk daily <pct> - Set daily loss limit (%)\n" +
            "/risk maxloss <usd> - Set max daily loss ($)\n" +
            "/risk cap <usd> - Daily profit cap; stop new trades at this profit (0 = off)\n" +
            "/risk trend <hours> - Only take signals aligned with this trend lookback (0 = off)\n" +
            "/risk losses <n> - SL hits per symbol that trigger a cooldown (0 = off)\n" +
            "/risk losswindow <min> - Window for counting SL hits\n" +
            "/risk cooldown <min> - How long a symbol stays paused after the streak\n" +
            "/cooldown - List cooled-down symbols\n" +
            "/cooldown reset [sym] - Clear a symbol's cooldown (or all)\n" +
            "/minhold <secs> - Min seconds to hold before TP is set\n" +
            "/closeall - Close all open positions\n" +
            "/export [from] [to] - Export trade history (CSV)\n" +
            "\n" +
            "/balance - Show account balance\n" +
            "/status - Connection health + bot status\n" +
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
    (0, amend_1.setAmendConnection)(ctrader);
    (0, midnightClose_1.setMidnightConnection)(ctrader);
    (0, export_1.setExportConnection)(ctrader);
    (0, status_1.setStatusConnection)(ctrader);
    (0, midnightClose_1.startMidnightCheck)();
    (0, dailyLoss_2.startDailyReset)();
    console.log("[SAFETY] Midnight closer and daily reset active");
    await (0, account_1.fetchAccountInfo)(ctrader);
    await (0, symbols_2.fetchSymbols)(ctrader);
    await (0, orders_1.reconcilePositions)();
    // Seed today's realized P&L from the broker so the daily loss/profit limits
    // survive a restart, then re-apply the lock if a limit was already breached.
    try {
        state_1.state.dailyRealizedPnL = await (0, account_1.fetchTodayRealizedPnL)(ctrader);
        console.log(`[PNL] Seeded today's realized P&L: ${state_1.state.dailyRealizedPnL.toFixed(2)}`);
        (0, dailyLoss_1.evaluateDailyLimits)(false);
    }
    catch (err) {
        console.warn(`[PNL] Could not seed daily P&L: ${err.errorCode || err.message || "request failed"}`);
    }
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