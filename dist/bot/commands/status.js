"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStatusConnection = setStatusConnection;
exports.balanceCmd = balanceCmd;
exports.statusCmd = statusCmd;
const state_1 = require("../../state");
const account_1 = require("../../ctrader/account");
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
// Net realized P&L for closed deals since 00:00 UTC today, read live from the
// broker. We don't trust the in-memory counter — it only reflects closes the
// bot witnessed this session and is zero after a restart.
async function todayRealizedPnL() {
    const now = new Date();
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const res = await connection.sendCommand("ProtoOADealListReq", {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
        fromTimestamp: startOfDay,
        toTimestamp: now.getTime(),
        maxRows: 1000,
    });
    let net = 0;
    for (const d of res.deal || []) {
        const cpd = d.closePositionDetail; // only closing deals carry realized P&L
        if (!cpd)
            continue;
        const div = Math.pow(10, Number(cpd.moneyDigits ?? 2));
        net += (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / div;
    }
    return net;
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
            dailyPnL = await todayRealizedPnL();
        }
        catch {
            dailyPnL = state_1.state.dailyRealizedPnL;
        }
    }
    const lines = [
        `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
        `Account: ${process.env.ACCOUNT_ID || "?"}`,
        `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
        `Trading: ${state_1.state.paused ? "⏸ paused" : "▶️ active"}${state_1.state.tradingLocked ? " (locked)" : ""}`,
        `Open positions: ${state_1.state.positions.size}/${state_1.state.settings.maxPositions}`,
        `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
        `Allowed symbols: ${state_1.state.settings.allowedSymbols.length}`,
        `Broker instruments: ${state_1.state.symbolMap.size}`,
    ];
    await ctx.reply(lines.join("\n"));
}
//# sourceMappingURL=status.js.map