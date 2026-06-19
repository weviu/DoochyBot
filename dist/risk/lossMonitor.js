"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLossMonitor = startLossMonitor;
const state_1 = require("../state");
const dailyLoss_1 = require("./dailyLoss");
const midnightClose_1 = require("./midnightClose");
const livePrices_1 = require("../ctrader/livePrices");
const notify_1 = require("../bot/notify");
// Hard daily-loss enforcement. The loss limit in dailyLoss.ts only LOCKS trading
// (blocks new signals) when breached — it never closes open positions. This
// monitor is the missing piece: it polls realized + floating P&L every second
// and force-closes everything the moment the combined loss reaches the limit,
// so the account can't drift toward the broker's own (larger) hard limit and
// fail. Mirrors the profit-cap monitor in capMonitor.ts.
let closing = false; // guard against re-entrant closes while a sweep is in flight.
// A single tick below the limit can be a wick or a momentary spread blip. Require
// the breach to persist across this many consecutive polls before force-closing,
// so a one-off spike doesn't liquidate everything at the worst instant.
const CONFIRM_TICKS = 2;
let breachStreak = 0;
const POLL_MS = 1_000;
function startLossMonitor() {
    setInterval(async () => {
        // Never act on an unseeded counter — a failed P&L seed leaves realized at 0
        // and could false-trigger. Same guard the lock check uses.
        if (!state_1.state.dailyPnLSeeded) {
            breachStreak = 0;
            return;
        }
        if (state_1.state.positions.size === 0) {
            breachStreak = 0;
            return;
        }
        // Keep every open position streaming so floating P&L is complete. Idempotent.
        await (0, livePrices_1.subscribeOpenPositions)();
        if (closing)
            return;
        // Defensive guard: only act when EVERY open position has a live quote.
        // Without a quote, floatingPnL() understates that position's loss (it skips
        // it), so the total is incomplete — we could miss a real breach or act on a
        // half-computed number. Wait for full data instead.
        const allQuoted = [...state_1.state.positions.values()].every((p) => (0, livePrices_1.hasLiveQuote)(p.symbol));
        if (!allQuoted) {
            breachStreak = 0;
            return;
        }
        const floating = (0, dailyLoss_1.floatingPnL)();
        const total = state_1.state.dailyRealizedPnL + floating;
        const limit = (0, dailyLoss_1.maxLossUSD)();
        // Loss limits are positive numbers; the breach is when combined P&L drops to
        // -limit or below. maxLossUSD (e.g. $200) already sits well inside the
        // broker's own limit (e.g. $300), leaving natural slippage headroom for the
        // ~1s confirm delay and the close round-trip.
        if (total > -limit) {
            breachStreak = 0;
            return;
        }
        breachStreak++;
        if (breachStreak < CONFIRM_TICKS)
            return;
        closing = true;
        breachStreak = 0;
        // Lock BEFORE the closes land. The closing deals fire updateDailyPnL ->
        // evaluateDailyLimits(true), which would otherwise also announce the breach;
        // locking first makes that path see we're already locked and stay quiet.
        (0, state_1.setTradingLock)(true);
        const count = state_1.state.positions.size;
        console.log(`[LOSS] Breach: realized ${state_1.state.dailyRealizedPnL.toFixed(2)} + floating ${floating.toFixed(2)} = ${total.toFixed(2)} <= -${limit.toFixed(2)}. Force-closing ${count} position(s).`);
        try {
            const { closed, failed } = await (0, midnightClose_1.closeAllPositions)();
            (0, notify_1.notify)(`Daily loss limit hit: ${total.toFixed(2)} USD (limit -${limit.toFixed(2)}). ` +
                `Force-closed ${closed}/${count} position(s)${failed ? ` — ${failed} FAILED, check manually` : ""}. ` +
                `New signals blocked until midnight UTC or /resume.`);
        }
        catch (err) {
            console.log(`[LOSS] Force-close error: ${err.message}`);
        }
        finally {
            closing = false;
        }
    }, POLL_MS);
    console.log(`[LOSS] Daily-loss monitor active (every ${POLL_MS / 1000}s)`);
}
//# sourceMappingURL=lossMonitor.js.map