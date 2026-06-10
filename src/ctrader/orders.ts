import { randomUUID } from "crypto";
import { state } from "../state";
import { ParsedSignal } from "../signals/types";
import { amendPositionSLTP } from "./amend";
import { updateDailyPnL } from "../risk/dailyLoss";
import { recordStopLoss } from "../risk/cooldown";

let connection: any = null;

export function getConnection(): any { return connection; }

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
      // Realized P&L from the closing deal drives the daily loss/profit limits.
      const cpd = data.deal?.closePositionDetail;
      let net = 0;
      if (cpd) {
        const div = Math.pow(10, Number(cpd.moneyDigits ?? 2));
        net = (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / div;
        updateDailyPnL(net);
      }

      // Per-symbol consecutive-loss protection. A stop-loss exit = the close came
      // from the SL/TP order (or a forced stop-out) and the trade lost money;
      // that excludes take-profits (net >= 0) and manual closes (no SL/TP order).
      const tracked = state.positions.get(pos.positionId);
      const ord = data.order;
      const viaStopOrder = ord?.isStopOut || ord?.orderType === "STOP_LOSS_TAKE_PROFIT";
      if (tracked && viaStopOrder && net < 0) {
        recordStopLoss(tracked.symbol);
      }

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

export async function getSymbolSpec(symbolId: number): Promise<SymbolSpec | null> {
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

// Reverse lookup of a symbolId to its name using the cached symbolMap.
function symbolNameById(symbolId: number): string {
  const target = String(symbolId);
  for (const [name, id] of state.symbolMap.entries()) {
    if (String(id) === target) return name;
  }
  return `#${symbolId}`;
}

// On startup, pull the broker's actual open positions into state.positions.
// state.positions is in-memory only, so without this a restart would forget
// open positions — leaving the midnight closer and max-positions gate blind to
// anything opened before the restart.
export async function reconcilePositions(): Promise<void> {
  if (!connection) return;

  // Reconcile is a nice-to-have (repopulates positions opened before a restart).
  // Some accounts/servers reject it (CANT_ROUTE_REQUEST), so never let a failure
  // here crash boot — log and continue.
  try {
    const res = await connection.sendCommand("ProtoOAReconcileReq", {
      ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
    });
    const positions = res.position || [];

    let count = 0;
    for (const p of positions) {
      if (p.positionStatus && p.positionStatus !== "POSITION_STATUS_OPEN" && p.positionStatus !== 1) continue;
      const td = p.tradeData || {};
      const symbolId = Number(td.symbolId);
      const volumeCents = Number(td.volume) || 0;

      let lots = 0;
      const spec = await getSymbolSpec(symbolId);
      if (spec?.lotSize) lots = volumeCents / spec.lotSize;

      const entry = Number(p.price) || 0;
      const direction: "BUY" | "SELL" = td.tradeSide === "SELL" ? "SELL" : "BUY";
      const posSlot = {
        symbol: symbolNameById(symbolId),
        direction,
        volume: lots,
        volumeCents,
        entryPrice: entry,
        openTime: Number(td.openTimestamp) || Date.now(),
        sl: p.stopLoss ?? null,
        tp: p.takeProfit ?? null,
      };
      state.positions.set(p.positionId, posSlot);

      // If the position has no TP (e.g. bot restarted during minhold window),
      // re-arm it immediately — the hold period has already passed.
      if (!p.takeProfit && entry && state.settings.takeProfitPercent > 0) {
        const tp = direction === "BUY"
          ? entry * (1 + state.settings.takeProfitPercent / 100)
          : entry * (1 - state.settings.takeProfitPercent / 100);
        const sl = p.stopLoss ?? undefined;
        console.log(`[RECONCILE] Re-arming TP ${tp.toFixed(2)} for position #${p.positionId} (${posSlot.symbol})`);
        amendPositionSLTP(p.positionId, posSlot.symbol, entry, direction, { sl, tp });
      }

      count++;
    }

    console.log(`[RECONCILE] Loaded ${count} open position(s) from broker. Tracking ${state.positions.size}.`);
  } catch (err: any) {
    console.warn(`[RECONCILE] Skipped — ${err.errorCode || err.message || "request failed"}. Bot will track only positions it opens this session.`);
  }
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
            volumeCents: orderVolume,
            entryPrice,
            openTime: Date.now(),
            confidence: signal.confidence,
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