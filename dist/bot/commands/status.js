"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStatusConnection = setStatusConnection;
exports.balanceCmd = balanceCmd;
exports.statusCmd = statusCmd;
const state_1 = require("../../state");
const account_1 = require("../../ctrader/account");
const cooldown_1 = require("../../risk/cooldown");
let connection = null;
function setStatusConnection(conn) {
    connection = conn;
}
async function balanceCmd(ctx) {
    if (!connection) {
        await ctx.reply("No cTrader connection.");
        return;
    }
    try {
        const info = await (0, account_1.fetchTrader)(connection);
        await ctx.reply(`Balance: ${info.balance.toFixed(2)} ${info.currency}`);
    }
    catch (err) {
        await ctx.reply(`Failed to fetch balance: ${err.errorCode || err.message || "request failed"}`);
    }
}
async function statusCmd(ctx) {
    // Health check: a live ProtoOATraderReq confirms the cTrader link is alive.
    let connOk = false;
    let info = state_1.state.accountInfo;
    if (connection) {
        try {
            info = await (0, account_1.fetchTrader)(connection);
            connOk = true;
        }
        catch {
            connOk = false;
        }
    }
    // Pull today's realized P&L from the broker; fall back to the in-memory
    // counter if the request fails.
    let dailyPnL = state_1.state.dailyRealizedPnL;
    if (connOk) {
        try {
            dailyPnL = await (0, account_1.fetchTodayRealizedPnL)(connection);
        }
        catch {
            dailyPnL = state_1.state.dailyRealizedPnL;
        }
    }
    const cap = state_1.state.settings.dailyProfitCapUSD;
    const cooldowns = (0, cooldown_1.activeCooldowns)();
    const lines = [
        `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
        `Account: ${process.env.ACCOUNT_ID || "?"}`,
        `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
        `Trading: ${state_1.state.paused ? "⏸ paused" : "▶️ active"}${state_1.state.tradingLocked ? " 🔒 locked" : ""}`,
        `Open positions: ${state_1.state.positions.size}/${state_1.state.settings.maxPositions}`,
        `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
        `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)}` : "off"}`,
        `Trend filter: ${state_1.state.settings.trendLookbackHours > 0 ? `${state_1.state.settings.trendLookbackHours}h` : "off"}`,
        `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
        `Allowed symbols: ${state_1.state.settings.allowedSymbols.length}`,
    ];
    await ctx.reply(lines.join("\n"));
}
//# sourceMappingURL=status.js.map