"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConnection = setConnection;
exports.executeSignal = executeSignal;
const state_1 = require("../state");
const amend_1 = require("./amend");
let connection = null;
function setConnection(conn) {
    console.log('[ORDERS] setConnection called, sendCommand type:', typeof conn.sendCommand);
    connection = conn;
}
async function executeSignal(signal) {
    if (!connection) {
        console.log("[ORDER] No cTrader connection");
        return;
    }
    console.log("[ORDER] executeSignal called for", signal.symbol);
    const symbolId = state_1.state.symbolMap.get(signal.symbol) ?? state_1.state.symbolMap.get(signal.symbol.replace(/USD$/, ""));
    if (!symbolId) {
        console.log(`[ORDER] Symbol not found in cache: ${signal.symbol}`);
        return;
    }
    console.log(`[ORDER] Resolved ${signal.symbol} → symbolId ${symbolId}`);
    const volume = state_1.state.settings.symbolLotSize[signal.symbol] ?? state_1.state.settings.lotSize;
    try {
        console.log(`[ORDER] Placing ${signal.direction} ${volume} ${signal.symbol}...`);
        await connection.sendCommand("ProtoOANewOrderReq", {
            ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            symbolId,
            orderType: "MARKET",
            tradeSide: signal.direction,
            volume: volume * 100000,
            timeInForce: "IMMEDIATE_OR_CANCEL",
        });
        const fillPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Order fill timeout (30s)"));
            }, 30_000);
            const onExecution = (event) => {
                if (event.executionType === "ORDER_FILLED" && event.position?.positionId) {
                    clearTimeout(timeout);
                    connection.off?.("ProtoOAExecutionEvent", onExecution);
                    const pos = event.position;
                    const deal = event.deal;
                    const positionId = pos.positionId;
                    const entryPrice = deal?.executionPrice || pos.price || 0;
                    state_1.state.positions.set(positionId, {
                        symbol: signal.symbol,
                        direction: signal.direction,
                        volume,
                        entryPrice,
                        openTime: Date.now(),
                    });
                    console.log(`[ORDER] Filled: ${signal.direction} ${volume} ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
                    (0, amend_1.amendPositionSLTP)(positionId, signal.symbol, entryPrice, signal.direction, {
                        sl: signal.sl,
                        tp: signal.tp,
                    });
                    resolve();
                }
            };
            connection.on("ProtoOAExecutionEvent", onExecution);
        });
        await fillPromise;
    }
    catch (err) {
        console.log(`[ORDER] Failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
    }
}
//# sourceMappingURL=orders.js.map