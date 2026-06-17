"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeReversal = executeReversal;
const state_1 = require("../state");
const midnightClose_1 = require("./midnightClose");
const orders_1 = require("../ctrader/orders");
const notify_1 = require("../bot/notify");
// Flip a position: close the existing one, wait briefly so cTrader settles the
// close, then open the opposite-direction signal. Only called by the gate after
// it has confirmed the new signal's confidence is strictly higher.
async function executeReversal(positionId, existing, signal) {
    // Step 1 — close the existing position. closePosition removes it from
    // state.positions on success.
    const closed = await (0, midnightClose_1.closePosition)(positionId);
    if (!closed) {
        console.log(`[REVERSAL] Aborted — failed to close ${existing.direction} ${existing.symbol} #${positionId}. Existing position stays open.`);
        return;
    }
    console.log(`[REVERSAL] Closed ${existing.direction} ${existing.symbol} #${positionId}`);
    // Step 2 — brief delay so the broker processes the close before the new order.
    await new Promise((r) => setTimeout(r, 1000));
    // Step 3 — open the new position. executeSignal handles its own errors, so we
    // verify success by checking a matching position actually opened.
    try {
        await (0, orders_1.executeSignal)(signal);
    }
    catch (err) {
        console.log(`[REVERSAL] executeSignal threw: ${err.message}`);
    }
    const opened = [...state_1.state.positions.values()].some((p) => p.symbol === signal.symbol && p.direction === signal.direction);
    if (opened) {
        console.log(`[REVERSAL] Opened ${signal.direction} ${signal.symbol}`);
    }
    else {
        const msg = `CRITICAL: closed ${existing.direction} ${existing.symbol} #${positionId} but new ${signal.direction} ${signal.symbol} did NOT open — account may be unhedged`;
        console.log(`[REVERSAL] ${msg}`);
        await (0, notify_1.notify)(msg);
    }
    // P&L from the close is handled by the normal position-close tracking.
}
//# sourceMappingURL=reversal.js.map