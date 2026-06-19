"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startStopLossWatchdog = startStopLossWatchdog;
const state_1 = require("../state");
const orders_1 = require("../ctrader/orders");
const amend_1 = require("../ctrader/amend");
// Stop-loss safety net. The post-fill amend that attaches a stop loss can fail
// silently (a sent amend whose ORDER_REPLACED confirmation never arrives), which
// would leave an open position unprotected. This watchdog is not a fix for that
// race; it is a backstop. Every 60s it asks the broker for the real, broker-side
// SL on every open position and re-sends the amendment for any that has none.
const POLL_MS = 60_000;
function startStopLossWatchdog() {
    setInterval(async () => {
        const conn = (0, orders_1.getConnection)();
        if (!conn || state_1.state.positions.size === 0)
            return;
        let res;
        try {
            res = await conn.sendCommand("ProtoOAReconcileReq", {
                ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            });
        }
        catch (err) {
            console.warn(`[SL-WATCHDOG] Reconcile failed: ${err.errorCode || err.message || "request failed"}`);
            return;
        }
        // Broker-side stop loss per position id (0/absent means no SL on the broker).
        const brokerSL = new Map();
        for (const p of res.position || []) {
            brokerSL.set(Number(p.positionId), p.stopLoss ? Number(p.stopLoss) : 0);
        }
        for (const [pid, pos] of state_1.state.positions.entries()) {
            const sl = brokerSL.get(pid) ?? 0;
            if (sl > 0)
                continue; // protected, nothing to do
            console.log(`[SL-WATCHDOG] Position #${pid} ${pos.direction} ${pos.symbol} has NO broker-side SL - re-sending amendment`);
            try {
                // Re-send our intended SL/TP. amendPositionSLTP recomputes a percentage
                // SL when none is stored, and sends SL immediately even inside min-hold.
                await (0, amend_1.amendPositionSLTP)(pid, pos.symbol, pos.entryPrice, pos.direction, {
                    sl: pos.sl ?? undefined,
                    tp: pos.tp ?? undefined,
                });
            }
            catch (err) {
                console.warn(`[SL-WATCHDOG] Re-amend failed for #${pid}: ${err.message}`);
            }
        }
    }, POLL_MS);
    console.log(`[SL-WATCHDOG] Stop-loss watchdog active (every ${POLL_MS / 1000}s)`);
}
//# sourceMappingURL=slWatchdog.js.map