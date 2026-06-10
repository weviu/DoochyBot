"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStatusConnection = setStatusConnection;
exports.balanceCmd = balanceCmd;
exports.statusCmd = statusCmd;
const state_1 = require("../../state");
const account_1 = require("../../ctrader/account");
const cooldown_1 = require("../../risk/cooldown");
const dailyLoss_1 = require("../../risk/dailyLoss");
const orders_1 = require("../../ctrader/orders");
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
    // Compute floating P&L from live broker mark prices (reconcile), not feed
    // prices — feed prices are absent right after a restart until first signal.
    let liveFloating = 0;
    if (connOk && state_1.state.positions.size > 0) {
        try {
            const res = await connection.sendCommand("ProtoOAReconcileReq", {
                ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            });
            for (const p of res.position || []) {
                const tracked = state_1.state.positions.get(p.positionId);
                if (!tracked)
                    continue;
                const mark = Number(p.price) || 0;
                if (!mark || !tracked.entryPrice)
                    continue;
                const symbolId = state_1.state.symbolMap.get(tracked.symbol);
                if (symbolId === undefined)
                    continue;
                const spec = await (0, orders_1.getSymbolSpec)(symbolId);
                if (!spec?.lotSize)
                    continue;
                const diff = tracked.direction === "BUY" ? mark - tracked.entryPrice : tracked.entryPrice - mark;
                liveFloating += diff * (tracked.volumeCents / 100);
            }
        }
        catch {
            liveFloating = (0, dailyLoss_1.floatingPnL)(); // fall back to feed-price estimate
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
        `Floating P&L: ${liveFloating >= 0 ? "+" : ""}${liveFloating.toFixed(2)} ${info.currency}`,
        `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)} (total ${(dailyPnL + liveFloating).toFixed(2)} used)` : "off"}`,
        `Trend filter: ${state_1.state.settings.trendLookbackHours > 0 ? `${state_1.state.settings.trendLookbackHours}h` : "off"}`,
        `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
        `Allowed symbols: ${state_1.state.settings.allowedSymbols.length}`,
    ];
    await ctx.reply(lines.join("\n"));
}
//# sourceMappingURL=status.js.map