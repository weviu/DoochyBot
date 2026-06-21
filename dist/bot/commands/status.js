"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStatusConnection = setStatusConnection;
exports.statusCmd = statusCmd;
const state_1 = require("../../state");
const account_1 = require("../../ctrader/account");
const cooldown_1 = require("../../risk/cooldown");
const dailyLoss_1 = require("../../risk/dailyLoss");
let connection = null;
function setStatusConnection(conn) {
    connection = conn;
}
async function statusCmd(ctx) {
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
    let dailyPnL = state_1.state.dailyRealizedPnL;
    if (connOk) {
        try {
            dailyPnL = await (0, account_1.fetchTodayRealizedPnL)(connection);
        }
        catch {
            dailyPnL = state_1.state.dailyRealizedPnL;
        }
    }
    // Feed prices (recordPrice) are updated on every signal that passes through gate.
    // Immediately after restart they're seeded with entry prices until the first
    // signal for each symbol arrives, so floating may show ~0 briefly.
    const liveFloating = (0, dailyLoss_1.floatingPnL)();
    const cap = state_1.state.settings.dailyProfitCapUSD;
    const cooldowns = (0, cooldown_1.activeCooldowns)();
    const lines = [
        `cTrader: ${connOk ? "connected" : "not connected"}`,
        `Account: ${process.env.ACCOUNT_ID || "?"}`,
        `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
        `Trading: ${state_1.state.paused ? "paused" : "active"}${state_1.state.tradingLocked ? " (locked)" : ""}`,
        `Open positions: ${state_1.state.positions.size}/${state_1.state.settings.maxPositions}`,
        `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
        `Floating P&L: ${liveFloating >= 0 ? "+" : ""}${liveFloating.toFixed(2)} ${info.currency}`,
        `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)} (total ${(dailyPnL + liveFloating).toFixed(2)} used)` : "off"}`,
        `Daily loss limit: -$${(0, dailyLoss_1.maxLossUSD)().toFixed(2)} (force-close all)`,
        `Sizing: ${state_1.state.settings.riskPerTradeUSD > 0 ? `$${state_1.state.settings.riskPerTradeUSD.toFixed(2)} risk/trade @ ${state_1.state.settings.stopLossPercent}% SL / ${state_1.state.settings.takeProfitPercent}% TP` : "not set - /risk pertrade required to trade"}`,
        `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
        `Allowed symbols: ${state_1.state.settings.allowedSymbols.length}`,
    ];
    await ctx.reply(lines.join("\n"));
}
//# sourceMappingURL=status.js.map