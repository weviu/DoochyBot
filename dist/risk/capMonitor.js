"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCapMonitor = startCapMonitor;
const state_1 = require("../state");
const dailyLoss_1 = require("./dailyLoss");
const midnightClose_1 = require("./midnightClose");
const livePrices_1 = require("../ctrader/livePrices");
const notify_1 = require("../bot/notify");
// Hard daily profit-cap enforcement. The per-position "cap TP" set on each
// position handles the single-position case (the broker closes it instantly at
// the headroom price, even if the bot is down). But with several positions
// profiting at once, their COMBINED P&L can exceed the cap before any individual
// cap-TP triggers. This monitor is the primary guarantee: it polls the live
// floating P&L every second and force-closes everything the moment
// realized + floating reaches the cap (minus a small safety buffer).
//
// For a prop-firm best-day rule, undershooting the cap is harmless but
// overshooting fails the rule — so we deliberately trigger a hair early.
let closing = false; // guard against re-entrant closes while a sweep is in flight.
const POLL_MS = 1_000;
// Trigger this many dollars BELOW the cap to absorb the sub-second price move
// between the breach and the close round-trip. Prevents realized from landing
// above the cap. Tunable via /risk capbuffer.
function safetyBuffer() {
    return state_1.state.settings.capBufferUSD ?? 0;
}
function startCapMonitor() {
    setInterval(async () => {
        const cap = state_1.state.settings.dailyProfitCapUSD;
        if (cap <= 0)
            return;
        if (!state_1.state.dailyPnLSeeded)
            return;
        if (state_1.state.positions.size === 0)
            return;
        // Make sure every open position is streaming live prices, otherwise its
        // floating P&L is invisible and we could miss a breach. Idempotent.
        await (0, livePrices_1.subscribeOpenPositions)();
        if (closing)
            return;
        const floating = (0, dailyLoss_1.floatingPnL)();
        const total = state_1.state.dailyRealizedPnL + floating;
        const trigger = cap - safetyBuffer();
        if (total < trigger)
            return;
        closing = true;
        const count = state_1.state.positions.size;
        console.log(`[CAP] Breach: realized ${state_1.state.dailyRealizedPnL.toFixed(2)} + floating ${floating.toFixed(2)} = ${total.toFixed(2)} >= trigger ${trigger.toFixed(2)} (cap ${cap.toFixed(2)}). Force-closing ${count} position(s).`);
        try {
            const { closed, failed } = await (0, midnightClose_1.closeAllPositions)();
            state_1.state.tradingLocked = true;
            (0, notify_1.notify)(`🎯 Daily profit cap hit: +${total.toFixed(2)} USD (cap ${cap.toFixed(2)}). ` +
                `Force-closed ${closed}/${count} position(s)${failed ? ` — ${failed} FAILED, check manually` : ""}. ` +
                `New signals blocked until midnight UTC or /resume.`);
        }
        catch (err) {
            console.log(`[CAP] Force-close error: ${err.message}`);
        }
        finally {
            closing = false;
        }
    }, POLL_MS);
    console.log(`[CAP] Profit-cap monitor active (every ${POLL_MS / 1000}s)`);
}
//# sourceMappingURL=capMonitor.js.map