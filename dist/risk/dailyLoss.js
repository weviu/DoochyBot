"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDailyPnL = updateDailyPnL;
exports.isLocked = isLocked;
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
//# sourceMappingURL=dailyLoss.js.map