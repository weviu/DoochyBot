"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAmendConnection = setAmendConnection;
exports.amendPositionSLTP = amendPositionSLTP;
const state_1 = require("../state");
let connection = null;
function setAmendConnection(conn) {
    connection = conn;
}
async function amendPositionSLTP(positionId, symbol, entryPrice, direction, signal) {
    if (!connection) {
        console.log("[AMEND] No cTrader connection");
        return;
    }
    const sltpMode = state_1.state.settings.sltpMode || "auto";
    let sl = null;
    let tp = null;
    if (sltpMode === "auto" || sltpMode === "pivot") {
        sl = signal.sl ?? null;
        tp = signal.tp ?? null;
    }
    if (sltpMode === "dollar" || (!sl && !tp)) {
        const slUSD = state_1.state.settings.symbolStopLossUSD?.[symbol] || state_1.state.settings.stopLossUSD || 30;
        const tpUSD = state_1.state.settings.symbolTakeProfitUSD?.[symbol] || state_1.state.settings.takeProfitUSD || 45;
        const contractSize = 100000;
        const volume = 0.01;
        const slDistance = slUSD / (volume * contractSize * 0.01);
        const tpDistance = tpUSD / (volume * contractSize * 0.01);
        if (!sl)
            sl = direction === "BUY" ? entryPrice - slDistance : entryPrice + slDistance;
        if (!tp)
            tp = direction === "BUY" ? entryPrice + tpDistance : entryPrice - tpDistance;
    }
    if (sl && direction === "BUY" && sl >= entryPrice) {
        console.log(`[AMEND] Invalid SL for BUY: ${sl} >= entry ${entryPrice}. Skipping SL.`);
        sl = null;
    }
    if (sl && direction === "SELL" && sl <= entryPrice) {
        console.log(`[AMEND] Invalid SL for SELL: ${sl} <= entry ${entryPrice}. Skipping SL.`);
        sl = null;
    }
    if (tp && direction === "BUY" && tp <= entryPrice) {
        console.log(`[AMEND] Invalid TP for BUY: ${tp} <= entry ${entryPrice}. Skipping TP.`);
        tp = null;
    }
    if (tp && direction === "SELL" && tp >= entryPrice) {
        console.log(`[AMEND] Invalid TP for SELL: ${tp} >= entry ${entryPrice}. Skipping TP.`);
        tp = null;
    }
    if (sl) {
        try {
            await connection.sendCommand("ProtoOAAmendPositionSLTPReq", {
                ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
                positionId,
                stopLoss: sl,
            });
            console.log(`[AMEND] SL set: ${sl} | Position #${positionId}`);
            const pos = state_1.state.positions.get(positionId);
            if (pos)
                pos.sl = sl;
        }
        catch (err) {
            console.log(`[AMEND] SL failed: ${err.message}`);
        }
    }
    if (tp) {
        const delayMs = (state_1.state.settings.minHoldSeconds || 60) * 1000;
        console.log(`[AMEND] TP will be set in ${delayMs / 1000}s (min hold) | Position #${positionId}`);
        setTimeout(async () => {
            if (!state_1.state.positions.has(positionId)) {
                console.log(`[AMEND] TP skipped - position #${positionId} already closed`);
                return;
            }
            try {
                await connection.sendCommand("ProtoOAAmendPositionSLTPReq", {
                    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
                    positionId,
                    takeProfit: tp,
                });
                console.log(`[AMEND] TP set: ${tp} | Position #${positionId}`);
                const pos = state_1.state.positions.get(positionId);
                if (pos)
                    pos.tp = tp;
            }
            catch (err) {
                console.log(`[AMEND] TP failed: ${err.message}`);
            }
        }, delayMs);
    }
    if (!sl && !tp) {
        console.log(`[AMEND] No SL/TP to set for position #${positionId}`);
    }
}
//# sourceMappingURL=amend.js.map