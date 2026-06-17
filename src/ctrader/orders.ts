import { randomUUID } from "crypto";
import { state } from "../state";
import { ParsedSignal } from "../signals/types";
import { amendPositionSLTP } from "./amend";
import { updateDailyPnL } from "../risk/dailyLoss";
import { recordStopLoss } from "../risk/cooldown";
import { subscribeSpots, getMarkPrice } from "./livePrices";

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
    const positionId = Number(pos.positionId);
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
      const tracked = state.positions.get(positionId);
      const ord = data.order;
      const viaStopOrder = ord?.isStopOut || ord?.orderType === "STOP_LOSS_TAKE_PROFIT";
      if (tracked && viaStopOrder && net < 0) {
        recordStopLoss(tracked.symbol);
      }

      if (state.positions.delete(positionId)) {
        console.log(`[POSITIONS] Closed #${positionId}. Open now: ${state.positions.size}`);
      }

      // When a position closes, realized P&L changes — the remaining cap headroom
      // shifts. Re-amend all remaining positions so their cap TPs tighten (or
      // loosen) to reflect the new headroom. Only fires when cap is enabled.
      if (state.settings.dailyProfitCapUSD > 0 && state.dailyPnLSeeded && state.positions.size > 0) {
        for (const [pid, p] of state.positions.entries()) {
          amendPositionSLTP(pid, p.symbol, p.entryPrice, p.direction, {
            sl: p.sl ?? undefined,
          });
        }
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

// Compute the broker volume (cents) so a stopLossPercent move against the
// position loses ~riskUSD at the given price. The money model is the same one
// floatingPnL uses: $PnL = priceDiff × volumeCents/100. The stop sits
// stopDistance = price × slPct/100 away, so volumeCents = riskUSD × 100 /
// stopDistance. Snapped to the symbol's min/step/max.
function riskBasedVolume(riskUSD: number, price: number, slPct: number, spec: SymbolSpec): number | null {
  if (!spec.lotSize) return null;
  const stopDistance = price * (slPct / 100);
  if (stopDistance <= 0) return null;
  let vol = (riskUSD * 100) / stopDistance;
  if (spec.stepVolume > 0) vol = Math.round(vol / spec.stepVolume) * spec.stepVolume;
  if (spec.minVolume && vol < spec.minVolume) vol = spec.minVolume;
  if (spec.maxVolume && vol > spec.maxVolume) vol = spec.maxVolume;
  return vol > 0 ? vol : null;
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
    // Diagnostic: how many positions the broker actually returned, before our
    // status filter. If this is 0 while positions are open in cTrader, the
    // reconcile request itself is coming back empty (account/host routing).
    console.log(`[RECONCILE] Broker returned ${positions.length} raw position(s).`);

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
      // Seed the trend price history with the broker's current mark price so
      // floatingPnL() has a value immediately after restart.
      const symName = symbolNameById(symbolId);
      const posSlot = {
        symbol: symName,
        direction,
        volume: lots,
        volumeCents,
        entryPrice: entry,
        openTime: Number(td.openTimestamp) || Date.now(),
        sl: p.stopLoss ?? null,
        tp: p.takeProfit ?? null,
      };
      const pid = Number(p.positionId);
      state.positions.set(pid, posSlot);

      // If the position has no TP (e.g. bot restarted during minhold window),
      // re-arm it immediately — the hold period has already passed.
      if (!p.takeProfit && entry && state.settings.takeProfitPercent > 0) {
        const tp = direction === "BUY"
          ? entry * (1 + state.settings.takeProfitPercent / 100)
          : entry * (1 - state.settings.takeProfitPercent / 100);
        const sl = p.stopLoss ?? undefined;
        console.log(`[RECONCILE] Re-arming TP ${tp.toFixed(2)} for position #${pid} (${posSlot.symbol})`);
        amendPositionSLTP(pid, posSlot.symbol, entry, direction, { sl, tp });
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

  // Size the order using the symbol's real contract specs. A hardcoded
  // multiplier produces wildly wrong volumes for non-FX symbols (e.g. BTC),
  // which the broker rejects as NOT_ENOUGH_MONEY.
  const spec = await getSymbolSpec(symbolId);
  if (!spec) {
    console.log(`[ORDER] No contract spec for ${signal.symbol}; skipping`);
    return;
  }

  // Two sizing modes:
  //  - Risk-based (riskPerTradeUSD > 0): derive the volume so a stopLossPercent
  //    stop loses ~riskPerTradeUSD, using the live mark price. This bounds every
  //    trade's worst case to a fixed dollar amount — a flat SL % otherwise gives
  //    wildly different $ risk per symbol (e.g. one XAUUSD stop = 5× a BTCUSD one).
  //    Falls back to fixed lots if no live quote has arrived for the symbol yet.
  //  - Fixed (riskPerTradeUSD == 0): the configured per-symbol / default lot size.
  // Sizing is risk-based only: size so a stopLossPercent stop loses ~riskUSD.
  // There is no fixed-lot mode — if risk sizing isn't configured we refuse to
  // trade rather than guess a size (an unsized order is how the -$350 happened).
  const riskUSD = state.settings.riskPerTradeUSD ?? 0;
  const slPct = state.settings.stopLossPercent;
  if (riskUSD <= 0 || slPct <= 0) {
    console.log(`[ORDER] Risk sizing not configured (pertrade=$${riskUSD}, SL=${slPct}%) — skipping ${signal.symbol}. Set /risk pertrade and /risk sl.`);
    return;
  }

  // Prefer the live mark, but fall back to the signal's own price (feed price /
  // channel limit price) when no spot has streamed for this symbol yet.
  let price = getMarkPrice(signal.symbol, signal.direction);
  if (!price || price <= 0) {
    price = signal.limitPrice && signal.limitPrice > 0
      ? signal.limitPrice
      : signal.price && signal.price > 0
      ? signal.price
      : null;
    if (price) {
      console.log(`[ORDER] No live quote for ${signal.symbol} yet — sizing from signal price ${price}`);
    }
  }
  if (!price || price <= 0) {
    console.log(`[ORDER] No price for ${signal.symbol} (no live quote, signal carries none) — skipping to avoid an unsized order`);
    return;
  }

  const orderVolume = riskBasedVolume(riskUSD, price, slPct, spec);
  if (!orderVolume) {
    console.log(`[ORDER] Could not compute volume for ${signal.symbol} (lotSize ${spec.lotSize}); skipping`);
    return;
  }
  // Report the ACTUAL risk after snapping to broker min/step/max — a tiny
  // computed size can floor up to minVolume and exceed the target.
  const actualRisk = price * (slPct / 100) * (orderVolume / 100);
  console.log(`[ORDER] Risk-sized ${signal.symbol}: ${orderVolume} vol → ~$${actualRisk.toFixed(2)} at ${slPct}% SL (target $${riskUSD})`);
  if (actualRisk > riskUSD * 1.5) {
    console.log(`[ORDER] ${signal.symbol}: broker min volume forces risk to ~$${actualRisk.toFixed(2)}, above target $${riskUSD}`);
  }

  // Display lots derived from the final broker volume, so logs and the stored
  // position reflect the size actually sent regardless of sizing mode.
  const lots = spec.lotSize ? orderVolume / spec.lotSize : 0;

  // Unique label per order so we can correlate execution events back to THIS
  // order. Without it, concurrent orders' listeners all match any ORDER_FILLED
  // event and mis-attribute fills (double/wrong SL, missed positions).
  const label = randomUUID();

  // Register as pending the instant we're about to submit, so the duplicate gate
  // sees an outstanding order for this symbol+direction before any fill arrives.
  // cleanup() (fill/timeout/reject) and the catch below all clear it again.
  state.pendingOrders.set(label, {
    symbol: signal.symbol,
    direction: signal.direction,
    placedAt: Date.now(),
  });

  // Channel limit signals rest at the broker until price reaches the level,
  // rather than filling immediately like the feed's market orders. They carry
  // their SL/TP on the order itself so the resting order is self-contained
  // (protected even across a bot restart). Handled separately from the immediate
  // market fill path below; sizing/volume above is shared.
  if (signal.orderType === "LIMIT" && signal.limitPrice && signal.limitPrice > 0) {
    await placeLimitOrder(signal, symbolId, orderVolume, lots, label);
    return;
  }

  try {
    console.log(`[ORDER] Placing ${signal.direction} ${lots} lots (${orderVolume} vol) ${signal.symbol} (label ${label.slice(0, 8)})...`);

    const fillPromise = new Promise<void>((resolve, reject) => {
      let ourOrderId: number | null = null;

      const cleanup = () => {
        clearTimeout(timeout);
        connection.removeEventListener(listenerId);
        connection.removeEventListener(errorListenerId);
        state.pendingOrders.delete(label);
      };

      const timeout = setTimeout(async () => {
        cleanup();
        // The order is still unfilled but remains LIVE at the broker — it can
        // fill later, unattended. Cancel it before abandoning the attempt.
        if (ourOrderId !== null) {
          try {
            await connection.sendCommand("ProtoOACancelOrderReq", {
              ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
              orderId: ourOrderId,
            });
            console.log(`[ORDER] Timed out — cancelled unfilled order ${ourOrderId} (${signal.symbol})`);
          } catch (e: any) {
            console.log(`[ORDER] Timed out — cancel request FAILED for order ${ourOrderId} (${signal.symbol}): ${e.message}`);
          }
        } else {
          // No ORDER_ACCEPTED ever arrived — the broker never acknowledged the
          // order, so it was almost certainly REJECTED outright. cTrader sends
          // that rejection as a generic PROTO_OA_ERROR_RES (payload 2142), which
          // the ctrader-layer can't route and just logs as "Unknown payload type
          // 2142" — that line above this is the real cause. Common reasons:
          // ACCESS_TOKEN lacks the "trading" scope, CTRADER_HOST (demo/live)
          // doesn't match the account, or a wrong ACCOUNT_ID.
          console.log(`[ORDER] No broker acknowledgement for ${signal.symbol} — order was likely REJECTED (see any "Unknown payload type 2142" / PROTO_OA_ERROR_RES above). Check: ACCESS_TOKEN has "trading" scope, CTRADER_HOST matches the account (demo vs live), and ACCOUNT_ID is correct.`);
        }
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
          const positionId = Number(pos.positionId);
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
          // Stream live prices for this symbol so floating P&L / cap stay accurate.
          subscribeSpots([symbolId]);
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
    // Belt-and-braces: cleanup() clears the entry on the normal fill/timeout/
    // reject paths, but if sendCommand itself threw before any listener fired,
    // clear it here so a failed submission never blocks future signals.
    state.pendingOrders.delete(label);
    console.log(`[ORDER] Failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
  }
}

/**
 * Place a resting LIMIT order (channel signals). Unlike a market order it does
 * not fill immediately — it sits at the broker (GOOD_TILL_CANCEL) until price
 * reaches limitPrice, which may be seconds or hours. SL/TP are attached to the
 * order, so the resting order is protected even if the bot restarts before it
 * fills. We wait only long enough for the broker to ACCEPT the order (confirming
 * it is resting, or catching an outright rejection) and then return, leaving a
 * listener to record the position whenever the fill eventually arrives.
 *
 * Sizing/volume is computed by the caller (executeSignal) and shared with the
 * market path; only the order-send and fill-handling differ here.
 */
async function placeLimitOrder(
  signal: ParsedSignal,
  symbolId: number,
  orderVolume: number,
  lots: number,
  label: string
): Promise<void> {
  if (!connection) {
    console.log("[ORDER] No cTrader connection");
    state.pendingOrders.delete(label);
    return;
  }

  const limitPrice = signal.limitPrice!;
  // SL/TP come verbatim from the channel message (no arithmetic → no float junk,
  // so no rounding needed). Drop either if it sits on the wrong side of the limit
  // entry; the broker would reject the whole order otherwise.
  let sl: number | null = signal.sl ?? null;
  let tp: number | null = signal.tp ?? null;
  if (sl !== null && ((signal.direction === "BUY" && sl >= limitPrice) || (signal.direction === "SELL" && sl <= limitPrice))) {
    console.log(`[ORDER] Invalid SL ${sl} for ${signal.direction} limit @ ${limitPrice}; dropping SL`);
    sl = null;
  }
  if (tp !== null && ((signal.direction === "BUY" && tp <= limitPrice) || (signal.direction === "SELL" && tp >= limitPrice))) {
    console.log(`[ORDER] Invalid TP ${tp} for ${signal.direction} limit @ ${limitPrice}; dropping TP`);
    tp = null;
  }

  let fillListenerId = "";
  let errorListenerId = "";
  let settled = false; // placement phase resolved (accepted/filled) or failed

  const placement = new Promise<void>((resolve, reject) => {
    // If the broker never acknowledges, the order was almost certainly rejected
    // (same PROTO_OA_ERROR_RES / "Unknown payload type 2142" case as market
    // orders). Give up the placement wait — but never auto-cancel a resting
    // order just because it hasn't filled; that's the whole point of a limit.
    const placeTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      connection.removeEventListener(fillListenerId);
      connection.removeEventListener(errorListenerId);
      state.pendingOrders.delete(label);
      reject(new Error("No broker acknowledgement for limit order (likely rejected)"));
    }, 10_000);

    errorListenerId = connection.on("ProtoOAOrderErrorEvent", (event: any) => {
      const data = event.descriptor ?? event;
      console.log(`[ORDER] Limit OrderError for ${signal.symbol}:`, JSON.stringify(data));
      if (settled) return;
      settled = true;
      clearTimeout(placeTimeout);
      connection.removeEventListener(fillListenerId);
      connection.removeEventListener(errorListenerId);
      state.pendingOrders.delete(label);
      reject(new Error(`Order rejected: ${data.errorCode || "unknown"} ${data.description || ""}`));
    });

    fillListenerId = connection.on("ProtoOAExecutionEvent", (event: any) => {
      const data = event.descriptor ?? event;
      if (data.order?.tradeData?.label !== label) return;
      console.log(`[ORDER] Limit execution event (${signal.symbol}): type=${data.executionType} positionId=${data.position?.positionId}`);

      if (data.executionType === "ORDER_ACCEPTED" && !settled) {
        // The order is now resting at the broker. End the placement wait but keep
        // the fill listener registered for the (later) fill.
        settled = true;
        clearTimeout(placeTimeout);
        connection.removeEventListener(errorListenerId);
        console.log(`[ORDER] Limit resting: ${signal.direction} ${lots} lots ${signal.symbol} @ ${limitPrice} (SL ${sl ?? "—"} / TP ${tp ?? "—"})`);
        resolve();
        return;
      }

      if (data.executionType === "ORDER_FILLED" && data.position?.positionId) {
        const positionId = Number(data.position.positionId);
        const entryPrice = data.deal?.executionPrice || data.position.price || limitPrice;
        // SL/TP are already attached to the order broker-side; mirror them onto
        // the in-memory position for display and live monitoring.
        state.positions.set(positionId, {
          symbol: signal.symbol,
          direction: signal.direction,
          volume: lots,
          volumeCents: orderVolume,
          entryPrice,
          openTime: Date.now(),
          confidence: signal.confidence,
          sl,
          tp,
        });
        subscribeSpots([symbolId]);
        connection.removeEventListener(fillListenerId);
        state.pendingOrders.delete(label);
        console.log(`[ORDER] Limit filled: ${signal.direction} ${lots} lots ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
        // A limit through the market can fill instantly without a separate
        // ORDER_ACCEPTED first — settle the placement wait here too.
        if (!settled) {
          settled = true;
          clearTimeout(placeTimeout);
          connection.removeEventListener(errorListenerId);
          resolve();
        }
      }
    });
  });

  try {
    console.log(`[ORDER] Placing LIMIT ${signal.direction} ${lots} lots (${orderVolume} vol) ${signal.symbol} @ ${limitPrice} (label ${label.slice(0, 8)})...`);
    await connection.sendCommand("ProtoOANewOrderReq", {
      ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      symbolId,
      orderType: "LIMIT",
      tradeSide: signal.direction,
      volume: orderVolume,
      limitPrice,
      timeInForce: "GOOD_TILL_CANCEL",
      ...(sl !== null ? { stopLoss: sl } : {}),
      ...(tp !== null ? { takeProfit: tp } : {}),
      label,
    });
    await placement;
  } catch (err: any) {
    state.pendingOrders.delete(label);
    console.log(`[ORDER] Limit failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
  }
}