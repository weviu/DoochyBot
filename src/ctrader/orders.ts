import { state } from "../state";
import { ParsedSignal } from "../signals/types";
import { amendPositionSLTP } from "./amend";

let connection: any = null;

export function setConnection(conn: any): void {
  console.log('[ORDERS] setConnection called, sendCommand type:', typeof conn.sendCommand);
  connection = conn;
}

export async function executeSignal(signal: ParsedSignal): Promise<void> {
  if (!connection) {
    console.log("[ORDER] No cTrader connection");
    return;
  }

  console.log("[ORDER] executeSignal called for", signal.symbol);
  const symbolId = state.symbolMap.get(signal.symbol) ?? state.symbolMap.get(signal.symbol.replace(/USD$/, ""));
  if (!symbolId) {
    console.log(`[ORDER] Symbol not found in cache: ${signal.symbol}`);
    return;
  }
  console.log(`[ORDER] Resolved ${signal.symbol} → symbolId ${symbolId}`);
  const volume = state.settings.symbolLotSize[signal.symbol] ?? state.settings.lotSize;

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

    const fillPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Order fill timeout (30s)"));
      }, 30_000);

      const onExecution = (event: any) => {
        if (event.executionType === "ORDER_FILLED" && event.position?.positionId) {
          clearTimeout(timeout);
          connection.off?.("ProtoOAExecutionEvent", onExecution);
          const pos = event.position;
          const deal = event.deal;
          const positionId = pos.positionId;
          const entryPrice = deal?.executionPrice || pos.price || 0;

          state.positions.set(positionId, {
            symbol: signal.symbol,
            direction: signal.direction,
            volume,
            entryPrice,
            openTime: Date.now(),
          });

          console.log(`[ORDER] Filled: ${signal.direction} ${volume} ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
          amendPositionSLTP(positionId, signal.symbol, entryPrice, signal.direction, {
            sl: signal.sl,
            tp: signal.tp,
          });
          resolve();
        }
      };

      connection.on("ProtoOAExecutionEvent", onExecution);
    });

    await fillPromise;
  } catch (err: any) {
    console.log(`[ORDER] Failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
  }
}