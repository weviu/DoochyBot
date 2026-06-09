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
    const lines = [
        `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
        `Account: ${process.env.ACCOUNT_ID || "?"}`,
        `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
        `Trading: ${state_1.state.paused ? "⏸ paused" : "▶️ active"}${state_1.state.tradingLocked ? " (locked)" : ""}`,
        `Open positions: ${state_1.state.positions.size}/${state_1.state.settings.maxPositions}`,
        `Daily realized P&L: ${state_1.state.dailyRealizedPnL >= 0 ? "+" : ""}${state_1.state.dailyRealizedPnL.toFixed(2)} ${info.currency}`,
        `Symbols loaded: ${state_1.state.symbolMap.size}`,
        `Allowed symbols: ${state_1.state.settings.allowedSymbols.length}`,
    ];
    await ctx.reply(lines.join("\n"));
}
//# sourceMappingURL=status.js.map