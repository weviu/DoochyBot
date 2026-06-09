"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDailyPnL = updateDailyPnL;
exports.isLocked = isLocked;
exports.startDailyReset = startDailyReset;
const state_1 = require("../state");
function updateDailyPnL(closedPnl) {
    state_1.state.dailyRealizedPnL += closedPnl;
    console.log(`[PNL] Updated: ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} (total: ${state_1.state.dailyRealizedPnL.toFixed(2)})`);
    const limitPercent = (state_1.state.settings.dailyLossLimitPercent / 100) * 10000; // Assume $10k balance for now
    const limitUSD = state_1.state.settings.maxDailyLossUSD;
    const maxLoss = Math.min(limitPercent, limitUSD);
    if (state_1.state.dailyRealizedPnL < -maxLoss) {
        state_1.state.tradingLocked = true;
        console.log(`[PNL] DAILY LOSS LIMIT BREACHED. PnL: ${state_1.state.dailyRealizedPnL.toFixed(2)}. Limit: -${maxLoss.toFixed(2)}. Trading locked.`);
    }
}
function isLocked() {
    return state_1.state.tradingLocked;
}
// At 00:00 UTC, start a fresh trading day: zero the realized P&L and clear the
// daily-loss trading lock. Fires once per day.
function startDailyReset() {
    let resetToday = false;
    let lastDay = new Date().getUTCDate();
    setInterval(() => {
        const now = new Date();
        const day = now.getUTCDate();
        if (day !== lastDay) {
            lastDay = day;
            resetToday = false;
        }
        if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && !resetToday) {
            resetToday = true;
            state_1.state.dailyRealizedPnL = 0;
            state_1.state.tradingLocked = false;
            console.log("[PNL] New trading day — P&L and lock reset");
        }
    }, 60_000);
}
//# sourceMappingURL=dailyLoss.js.map