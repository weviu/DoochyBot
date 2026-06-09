import { randomUUID } from "crypto";
import { state } from "../state";
import { ParsedSignal } from "../signals/types";
import { amendPositionSLTP } from "./amend";

let connection: any = null;

export function setConnection(conn: any): void {
  console.log('[ORDERS] setConnection called, sendCommand type:', typeof conn.sendCommand);
  connection = conn;

  // Track position closes (SL/TP hit, manual close, stop-out) so they're
  // removed from state.positions — otherwise the open-position count only ever
  // grows and the max-positions gate eventually rejects everything.
  conn.on("ProtoOAExecutionEvent", (event: any) => {
    const data = event.descriptor ?? event;
    const pos = data.position;
    if (!pos?.positionId) return;
    if (pos.positionStatus === "POSITION_STATUS_CLOSED" || pos.positionStatus === 2) {
      if (state.positions.delete(pos.positionId)) {
        console.log(`[POSITIONS] Closed #${pos.positionId}. Open now: ${state.positions.size}`);
      }
    }
  });
}

interface SymbolSpec {
  lotSize: number;    // cents per 1.0 lot
  minVolume: number;  // cents
  stepVolume: number; // cents
  maxVolume: number;  // cents
}

// Per-symbol contract specs (broker data, not user settings) cached by symbolId.
const symbolSpecs = new Map<number, SymbolSpec>();

async function getSymbolSpec(symbolId: number): Promise<SymbolSpec | null> {
  const cached = symbolSpecs.get(symbolId);
  if (cached) return cached;

  const res = await connection.sendCommand("ProtoOASymbolByIdReq", {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
    symbolId: [symbolId],
  });
  const sym = (res.symbol || [])[0];
  if (!sym) return null;

  const spec: SymbolSpec = {
    lotSize: Number(sym.lotSize) || 0,
    minVolume: Number(sym.minVolume) || 0,
    stepVolume: Number(sym.stepVolume) || 1,
    maxVolume: Number(sym.maxVolume) || 0,
  };
  symbolSpecs.set(symbolId, spec);
  return spec;
}

// Convert a lot size into the broker's "cents" volume unit, clamped to the
// symbol's min/max and snapped to its step. Returns null if unknown.
function lotsToVolume(lots: number, spec: SymbolSpec): number | null {
  if (!spec.lotSize) return null;
  let vol = lots * spec.lotSize;
  if (spec.stepVolume > 0) vol = Math.round(vol / spec.stepVolume) * spec.stepVolume;
  if (spec.minVolume && vol < spec.minVolume) vol = spec.minVolume;
  if (spec.maxVolume && vol > spec.maxVolume) vol = spec.maxVolume;
  return vol;
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
  const lots = state.settings.symbolLotSize[signal.symbol] ?? state.settings.lotSize;

  // Size the order using the symbol's real contract specs. A hardcoded
  // multiplier produces wildly wrong volumes for non-FX symbols (e.g. BTC),
  // which the broker rejects as NOT_ENOUGH_MONEY.
  const spec = await getSymbolSpec(symbolId);
  if (!spec) {
    console.log(`[ORDER] No contract spec for ${signal.symbol}; skipping`);
    return;
  }
  const orderVolume = lotsToVolume(lots, spec);
  if (!orderVolume) {
    console.log(`[ORDER] Could not compute volume for ${signal.symbol} (lotSize ${spec.lotSize}); skipping`);
    return;
  }

  // Unique label per order so we can correlate execution events back to THIS
  // order. Without it, concurrent orders' listeners all match any ORDER_FILLED
  // event and mis-attribute fills (double/wrong SL, missed positions).
  const label = randomUUID();

  try {
    console.log(`[ORDER] Placing ${signal.direction} ${lots} lots (${orderVolume} vol) ${signal.symbol} (label ${label.slice(0, 8)})...`);

    const fillPromise = new Promise<void>((resolve, reject) => {
      let ourOrderId: number | null = null;

      const cleanup = () => {
        clearTimeout(timeout);
        connection.removeEventListener(listenerId);
        connection.removeEventListener(errorListenerId);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Order fill timeout (30s)"));
      }, 30_000);

      // Order rejections (market closed, bad volume, trading disabled) arrive
      // as ProtoOAOrderErrorEvent, NOT ProtoOAExecutionEvent. It carries no
      // label, so correlate by the orderId we learn from our ACCEPTED event.
      let errorListenerId: string;
      errorListenerId = connection.on("ProtoOAOrderErrorEvent", (event: any) => {
        const data = event.descriptor ?? event;
        if (ourOrderId !== null && data.orderId !== ourOrderId) return;
        console.log(`[ORDER] OrderError for ${signal.symbol}:`, JSON.stringify(data));
        cleanup();
        reject(new Error(`Order rejected: ${data.errorCode || "unknown"} ${data.description || ""}`));
      });

      let listenerId: string;
      listenerId = connection.on("ProtoOAExecutionEvent", (event: any) => {
        const data = event.descriptor ?? event;
        // Only handle events for OUR order, matched by label.
        if (data.order?.tradeData?.label !== label) return;

        if (data.order?.orderId) ourOrderId = data.order.orderId;
        console.log(`[ORDER] Execution event (${signal.symbol}): type=${data.executionType} positionId=${data.position?.positionId}`);

        if (data.executionType === "ORDER_FILLED" && data.position?.positionId) {
          cleanup();
          const pos = data.position;
          const deal = data.deal;
          const positionId = pos.positionId;
          const entryPrice = deal?.executionPrice || pos.price || 0;

          state.positions.set(positionId, {
            symbol: signal.symbol,
            direction: signal.direction,
            volume: lots,
            entryPrice,
            openTime: Date.now(),
          });

          console.log(`[ORDER] Filled: ${signal.direction} ${lots} lots ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
          amendPositionSLTP(positionId, signal.symbol, entryPrice, signal.direction, {
            sl: signal.sl,
            tp: signal.tp,
          });
          resolve();
        }
      });
    });

    await connection.sendCommand("ProtoOANewOrderReq", {
      ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      symbolId,
      orderType: "MARKET",
      tradeSide: signal.direction,
      volume: orderVolume,
      timeInForce: "IMMEDIATE_OR_CANCEL",
      label,
    });

    await fillPromise;
  } catch (err: any) {
    console.log(`[ORDER] Failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
  }
}