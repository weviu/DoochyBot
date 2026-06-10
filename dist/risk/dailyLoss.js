"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.floatingPnL = floatingPnL;
exports.evaluateDailyLimits = evaluateDailyLimits;
exports.updateDailyPnL = updateDailyPnL;
exports.isLocked = isLocked;
exports.startDailyReset = startDailyReset;
const state_1 = require("../state");
const notify_1 = require("../bot/notify");
const trend_1 = require("./trend");
// The hard daily loss threshold in USD (the tighter of the % and $ limits).
function maxLossUSD() {
    const limitPercent = (state_1.state.settings.dailyLossLimitPercent / 100) * 10000; // Assume $10k balance for now
    return Math.min(limitPercent, state_1.state.settings.maxDailyLossUSD);
}
// Sum of unrealized P&L across all open positions using the latest feed prices.
// Approximation: no quote-to-USD conversion, accurate enough for XAUUSD/BTCUSD.
function floatingPnL() {
    let total = 0;
    for (const pos of state_1.state.positions.values()) {
        const mark = (0, trend_1.getLatestPrice)(pos.symbol);
        if (!mark || !pos.entryPrice)
            continue;
        const diff = pos.direction === "BUY" ? mark - pos.entryPrice : pos.entryPrice - mark;
        total += diff * (pos.volumeCents / 100);
    }
    return total;
}
// If a daily limit is currently breached, return a human-readable reason for the
// lock; otherwise null. The profit cap uses realized + floating so an account
// already at +$390 realized won't open more positions while floating +$50.
// The loss limit stays realized-only — unrealized dips shouldn't lock you out.
function breachedLimit() {
    const cap = state_1.state.settings.dailyProfitCapUSD;
    if (cap > 0) {
        const total = state_1.state.dailyRealizedPnL + floatingPnL();
        if (total >= cap) {
            return `🎯 Daily profit cap reached: +${total.toFixed(2)} USD (cap ${cap.toFixed(2)})`;
        }
    }
    const loss = maxLossUSD();
    const totalPnL = state_1.state.dailyRealizedPnL + floatingPnL();
    if (totalPnL < -loss) {
        return `🛑 Daily loss limit hit: ${totalPnL.toFixed(2)} USD (limit -${loss.toFixed(2)})`;
    }
    return null;
}
// Re-check the daily limits against current realized P&L and lock trading if a
// limit is breached. Called after each close and once at boot. When `announce`
// is set, pushes a Telegram alert on the transition into a locked state.
function evaluateDailyLimits(announce) {
    // Never check limits against an unseeded counter — a failed seed leaves the
    // counter at 0, which would false-trigger the loss limit as soon as any
    // position closes at a loss within the session.
    if (!state_1.state.dailyPnLSeeded) {
        console.warn("[PNL] Skipping limit check — daily P&L not seeded from broker yet");
        return;
    }
    const reason = breachedLimit();
    if (!reason)
        return;
    const wasLocked = state_1.state.tradingLocked;
    state_1.state.tradingLocked = true;
    console.log(`[PNL] Trading locked — ${reason}`);
    if (announce && !wasLocked) {
        (0, notify_1.notify)(`${reason}. New signals are blocked until midnight UTC or /resume. Open positions keep managing their SL/TP.`);
    }
}
function updateDailyPnL(closedPnl) {
    state_1.state.dailyRealizedPnL += closedPnl;
    console.log(`[PNL] Updated: ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} (total: ${state_1.state.dailyRealizedPnL.toFixed(2)})`);
    evaluateDailyLimits(true);
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
            state_1.state.dailyPnLSeeded = true; // we just set it to 0 — that is the correct value
            state_1.state.tradingLocked = false;
            console.log("[PNL] New trading day — P&L and lock reset");
        }
    }, 60_000);
}
//# sourceMappingURL=dailyLoss.js.map