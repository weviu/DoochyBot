"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnection = getConnection;
exports.setConnection = setConnection;
exports.getSymbolSpec = getSymbolSpec;
exports.reconcilePositions = reconcilePositions;
exports.executeSignal = executeSignal;
const crypto_1 = require("crypto");
const state_1 = require("../state");
const amend_1 = require("./amend");
const dailyLoss_1 = require("../risk/dailyLoss");
const account_1 = require("./account");
const cooldown_1 = require("../risk/cooldown");
const reentryCooldown_1 = require("../risk/reentryCooldown");
const livePrices_1 = require("./livePrices");
const notify_1 = require("../bot/notify");
// Send a Telegram message when an order fills (toggled by /notifications). SL/TP
// are the values being applied: explicit channel levels when supplied, otherwise
// derived from the configured percentages, the same way the amend will set them.
function notifyFill(kind, signal, lots, entry, positionId, riskUsd, sl, tp) {
    if (!state_1.state.settings.notifyFills)
        return;
    const slPct = state_1.state.settings.stopLossPercent;
    const tpPct = state_1.state.settings.takeProfitPercent;
    const slP = sl ?? signal.sl ?? (signal.direction === "BUY" ? entry * (1 - slPct / 100) : entry * (1 + slPct / 100));
    const tpP = tp ?? signal.tp ?? (signal.direction === "BUY" ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100));
    const digits = (entry.toString().split(".")[1] || "").length || 2;
    const f = (n) => n.toFixed(digits);
    (0, notify_1.notify)(`${kind}\n` +
        `${signal.direction} ${signal.symbol} ${lots.toFixed(2)} lots @ ${entry}\n` +
        `SL ${f(slP)}  TP ${f(tpP)}\n` +
        `Risk ~$${riskUsd.toFixed(0)}  Position #${positionId}`);
}
let connection = null;
function getConnection() { return connection; }
function setConnection(conn) {
    console.log('[ORDERS] setConnection called, sendCommand type:', typeof conn.sendCommand);
    connection = conn;
    // Track position closes (SL/TP hit, manual close, stop-out) so they're
    // removed from state.positions — otherwise the open-position count only ever
    // grows and the max-positions gate eventually rejects everything.
    conn.on("ProtoOAExecutionEvent", (event) => {
        const data = event.descriptor ?? event;
        const pos = data.position;
        if (!pos?.positionId)
            return;
        const positionId = Number(pos.positionId);
        if (pos.positionStatus === "POSITION_STATUS_CLOSED" || pos.positionStatus === 2) {
            // Realized P&L from the closing deal drives the daily loss/profit limits.
            const cpd = data.deal?.closePositionDetail;
            let net = 0;
            if (cpd) {
                const div = Math.pow(10, Number(cpd.moneyDigits ?? 2));
                net = (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / div;
                (0, dailyLoss_1.updateDailyPnL)(net);
            }
            // Per-symbol consecutive-loss protection. A stop-loss exit = the close came
            // from the SL/TP order (or a forced stop-out) and the trade lost money;
            // that excludes take-profits (net >= 0) and manual closes (no SL/TP order).
            const tracked = state_1.state.positions.get(positionId);
            const ord = data.order;
            const viaStopOrder = ord?.isStopOut || ord?.orderType === "STOP_LOSS_TAKE_PROFIT";
            if (tracked && viaStopOrder && net < 0) {
                (0, cooldown_1.recordStopLoss)(tracked.symbol);
            }
            // Re-entry cooldown: ANY losing close (SL, stop-out, manual, forced) blocks
            // reopening the same symbol+direction for the configured window. Wins
            // (net >= 0) never trigger it.
            if (tracked && net < 0) {
                (0, reentryCooldown_1.recordLoss)(tracked.symbol, tracked.direction);
            }
            if (state_1.state.positions.delete(positionId)) {
                console.log(`[POSITIONS] Closed #${positionId}. Open now: ${state_1.state.positions.size}`);
            }
            // When a position closes, realized P&L changes — the remaining cap headroom
            // shifts. Re-amend all remaining positions so their cap TPs tighten (or
            // loosen) to reflect the new headroom. Only fires when cap is enabled.
            if (state_1.state.settings.dailyProfitCapUSD > 0 && state_1.state.dailyPnLSeeded && state_1.state.positions.size > 0) {
                for (const [pid, p] of state_1.state.positions.entries()) {
                    (0, amend_1.amendPositionSLTP)(pid, p.symbol, p.entryPrice, p.direction, {
                        sl: p.sl ?? undefined,
                    });
                }
            }
        }
    });
}
// Per-symbol contract specs (broker data, not user settings) cached by symbolId.
const symbolSpecs = new Map();
async function getSymbolSpec(symbolId) {
    const cached = symbolSpecs.get(symbolId);
    if (cached)
        return cached;
    const res = await connection.sendCommand("ProtoOASymbolByIdReq", {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
        symbolId: [symbolId],
    });
    const sym = (res.symbol || [])[0];
    if (!sym)
        return null;
    const spec = {
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
function riskBasedVolume(riskUSD, price, slPct, spec) {
    if (!spec.lotSize)
        return null;
    const stopDistance = price * (slPct / 100);
    if (stopDistance <= 0)
        return null;
    let vol = (riskUSD * 100) / stopDistance;
    if (spec.stepVolume > 0)
        vol = Math.round(vol / spec.stepVolume) * spec.stepVolume;
    if (spec.minVolume && vol < spec.minVolume)
        vol = spec.minVolume;
    if (spec.maxVolume && vol > spec.maxVolume)
        vol = spec.maxVolume;
    return vol > 0 ? vol : null;
}
// Reverse lookup of a symbolId to its name using the cached symbolMap.
function symbolNameById(symbolId) {
    const target = String(symbolId);
    for (const [name, id] of state_1.state.symbolMap.entries()) {
        if (String(id) === target)
            return name;
    }
    return `#${symbolId}`;
}
// On startup, pull the broker's actual open positions into state.positions.
// state.positions is in-memory only, so without this a restart would forget
// open positions — leaving the midnight closer and max-positions gate blind to
// anything opened before the restart.
async function reconcilePositions() {
    if (!connection)
        return;
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
            if (p.positionStatus && p.positionStatus !== "POSITION_STATUS_OPEN" && p.positionStatus !== 1)
                continue;
            const td = p.tradeData || {};
            const symbolId = Number(td.symbolId);
            const volumeCents = Number(td.volume) || 0;
            let lots = 0;
            const spec = await getSymbolSpec(symbolId);
            if (spec?.lotSize)
                lots = volumeCents / spec.lotSize;
            const entry = Number(p.price) || 0;
            const direction = td.tradeSide === "SELL" ? "SELL" : "BUY";
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
            state_1.state.positions.set(pid, posSlot);
            // If the position has no TP (e.g. bot restarted during minhold window),
            // re-arm it immediately — the hold period has already passed.
            if (!p.takeProfit && entry && state_1.state.settings.takeProfitPercent > 0) {
                const tp = direction === "BUY"
                    ? entry * (1 + state_1.state.settings.takeProfitPercent / 100)
                    : entry * (1 - state_1.state.settings.takeProfitPercent / 100);
                const sl = p.stopLoss ?? undefined;
                console.log(`[RECONCILE] Re-arming TP ${tp.toFixed(2)} for position #${pid} (${posSlot.symbol})`);
                (0, amend_1.amendPositionSLTP)(pid, posSlot.symbol, entry, direction, { sl, tp });
            }
            count++;
        }
        console.log(`[RECONCILE] Loaded ${count} open position(s) from broker. Tracking ${state_1.state.positions.size}.`);
    }
    catch (err) {
        console.warn(`[RECONCILE] Skipped — ${err.errorCode || err.message || "request failed"}. Bot will track only positions it opens this session.`);
    }
}
// Fraction of equity that may be committed as margin across all positions,
// split equally across maxPositions slots. Keeps every position affordable so up
// to maxPositions can be held at once, with a buffer left for adverse moves.
const MARGIN_CAP_FRACTION = 0.8;
// Ask the broker how much margin a volume needs on a symbol. This is the only
// figure that captures the symbol's leverage (gold needs ~1% of notional, alts
// can need ~40%), which risk-based sizing is blind to. Returns the amount in the
// deposit currency, or null if unavailable (caller then keeps the risk size).
async function getExpectedMargin(symbolId, volumeCents, direction) {
    try {
        const res = await connection.sendCommand("ProtoOAExpectedMarginReq", {
            ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            symbolId,
            volume: [volumeCents],
        });
        const m = (res.margin || [])[0];
        if (!m)
            return null;
        // int64 fields decode as strings; money is scaled by moneyDigits.
        const div = Math.pow(10, Number(res.moneyDigits ?? 2));
        const margin = Number(direction === "BUY" ? m.buyMargin : m.sellMargin) / div;
        return margin > 0 ? margin : null;
    }
    catch (err) {
        console.log(`[MARGIN] Expected-margin query failed for symbol ${symbolId}: ${err.errorCode || err.message || "request failed"}`);
        return null;
    }
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
    const riskUSD = state_1.state.settings.riskPerTradeUSD ?? 0;
    const slPct = state_1.state.settings.stopLossPercent;
    if (riskUSD <= 0 || slPct <= 0) {
        console.log(`[ORDER] Risk sizing not configured (pertrade=$${riskUSD}, SL=${slPct}%) — skipping ${signal.symbol}. Set /risk pertrade and /risk sl.`);
        return;
    }
    // Prefer the live mark, but fall back to the signal's own price (feed price /
    // channel limit price) when no spot has streamed for this symbol yet.
    let price = (0, livePrices_1.getMarkPrice)(signal.symbol, signal.direction);
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
    let orderVolume = riskBasedVolume(riskUSD, price, slPct, spec);
    if (!orderVolume) {
        console.log(`[ORDER] Could not compute volume for ${signal.symbol} (lotSize ${spec.lotSize}); skipping`);
        return;
    }
    // Margin-aware cap. Risk-based sizing bounds the dollar risk at the stop but
    // ignores margin, so a tight stop on a low-leverage symbol (alts) can need far
    // more margin than the account can post, which the broker rejects as
    // NOT_ENOUGH_MONEY. Cap each position to an equal share of equity so up to
    // maxPositions positions always fit. Fail-safe: if the margin figure is
    // unavailable we keep the risk-based size (the broker still rejects if short).
    const expMargin = await getExpectedMargin(symbolId, orderVolume, signal.direction);
    if (expMargin !== null) {
        let balance = state_1.state.accountInfo.balance;
        try {
            balance = (await (0, account_1.fetchTrader)(connection)).balance;
        }
        catch { /* keep cached balance */ }
        const equity = balance + (0, dailyLoss_1.floatingPnL)();
        const budget = (equity * MARGIN_CAP_FRACTION) / Math.max(1, state_1.state.settings.maxPositions);
        if (expMargin > budget) {
            const step = spec.stepVolume || 1;
            const scaled = Math.floor((orderVolume * budget) / expMargin / step) * step;
            if (!scaled || (spec.minVolume && scaled < spec.minVolume)) {
                console.log(`[MARGIN] ${signal.direction} ${signal.symbol}: needs ~$${expMargin.toFixed(2)} margin but per-trade budget is ~$${budget.toFixed(2)} (equity ~$${equity.toFixed(2)} / ${state_1.state.settings.maxPositions}); even the minimum size will not fit, skipping`);
                if (state_1.state.settings.notifyFills) {
                    (0, notify_1.notify)(`Skipped ${signal.direction} ${signal.symbol}: needs ~$${expMargin.toFixed(2)} margin, only ~$${budget.toFixed(2)} budget per trade. Lower /risk pertrade, widen /risk sl, or reduce /risk maxpos.`);
                }
                return;
            }
            console.log(`[MARGIN] ${signal.direction} ${signal.symbol}: margin-capped ${orderVolume} -> ${scaled} vol (needs ~$${expMargin.toFixed(2)} > budget ~$${budget.toFixed(2)}, equity ~$${equity.toFixed(2)})`);
            orderVolume = scaled;
        }
    }
    // Report the ACTUAL risk of the final (possibly margin-capped) size.
    const actualRisk = price * (slPct / 100) * (orderVolume / 100);
    console.log(`[ORDER] Risk-sized ${signal.symbol}: ${orderVolume} vol -> ~$${actualRisk.toFixed(2)} at ${slPct}% SL (target $${riskUSD})`);
    if (actualRisk > riskUSD * 1.5) {
        console.log(`[ORDER] ${signal.symbol}: broker min volume forces risk to ~$${actualRisk.toFixed(2)}, above target $${riskUSD}`);
    }
    // Display lots derived from the final broker volume, so logs and the stored
    // position reflect the size actually sent regardless of sizing mode.
    const lots = spec.lotSize ? orderVolume / spec.lotSize : 0;
    // Unique label per order so we can correlate execution events back to THIS
    // order. Without it, concurrent orders' listeners all match any ORDER_FILLED
    // event and mis-attribute fills (double/wrong SL, missed positions).
    const label = (0, crypto_1.randomUUID)();
    // Register as pending the instant we're about to submit, so the duplicate gate
    // sees an outstanding order for this symbol+direction before any fill arrives.
    // cleanup() (fill/timeout/reject) and the catch below all clear it again.
    state_1.state.pendingOrders.set(label, {
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
        const fillPromise = new Promise((resolve, reject) => {
            let ourOrderId = null;
            const cleanup = () => {
                clearTimeout(timeout);
                connection.removeEventListener(listenerId);
                connection.removeEventListener(errorListenerId);
                state_1.state.pendingOrders.delete(label);
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
                    }
                    catch (e) {
                        console.log(`[ORDER] Timed out — cancel request FAILED for order ${ourOrderId} (${signal.symbol}): ${e.message}`);
                    }
                }
                else {
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
            let errorListenerId;
            errorListenerId = connection.on("ProtoOAOrderErrorEvent", (event) => {
                const data = event.descriptor ?? event;
                if (ourOrderId !== null && data.orderId !== ourOrderId)
                    return;
                console.log(`[ORDER] OrderError for ${signal.symbol}:`, JSON.stringify(data));
                cleanup();
                reject(new Error(`Order rejected: ${data.errorCode || "unknown"} ${data.description || ""}`));
            });
            let listenerId;
            listenerId = connection.on("ProtoOAExecutionEvent", (event) => {
                const data = event.descriptor ?? event;
                // Only handle events for OUR order, matched by label.
                if (data.order?.tradeData?.label !== label)
                    return;
                if (data.order?.orderId)
                    ourOrderId = data.order.orderId;
                console.log(`[ORDER] Execution event (${signal.symbol}): type=${data.executionType} positionId=${data.position?.positionId}`);
                if (data.executionType === "ORDER_FILLED" && data.position?.positionId) {
                    cleanup();
                    const pos = data.position;
                    const deal = data.deal;
                    const positionId = Number(pos.positionId);
                    const entryPrice = deal?.executionPrice || pos.price || 0;
                    state_1.state.positions.set(positionId, {
                        symbol: signal.symbol,
                        direction: signal.direction,
                        volume: lots,
                        volumeCents: orderVolume,
                        entryPrice,
                        openTime: Date.now(),
                        confidence: signal.confidence,
                    });
                    console.log(`[ORDER] Filled: ${signal.direction} ${lots} lots ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
                    notifyFill("Order filled", signal, lots, entryPrice, positionId, actualRisk);
                    // Stream live prices for this symbol so floating P&L / cap stay accurate.
                    (0, livePrices_1.subscribeSpots)([symbolId]);
                    (0, amend_1.amendPositionSLTP)(positionId, signal.symbol, entryPrice, signal.direction, {
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
    }
    catch (err) {
        // Belt-and-braces: cleanup() clears the entry on the normal fill/timeout/
        // reject paths, but if sendCommand itself threw before any listener fired,
        // clear it here so a failed submission never blocks future signals.
        state_1.state.pendingOrders.delete(label);
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
async function placeLimitOrder(signal, symbolId, orderVolume, lots, label) {
    if (!connection) {
        console.log("[ORDER] No cTrader connection");
        state_1.state.pendingOrders.delete(label);
        return;
    }
    const limitPrice = signal.limitPrice;
    // SL/TP come verbatim from the channel message (no arithmetic → no float junk,
    // so no rounding needed). Drop either if it sits on the wrong side of the limit
    // entry; the broker would reject the whole order otherwise.
    let sl = signal.sl ?? null;
    let tp = signal.tp ?? null;
    if (sl !== null && ((signal.direction === "BUY" && sl >= limitPrice) || (signal.direction === "SELL" && sl <= limitPrice))) {
        console.log(`[ORDER] Invalid SL ${sl} for ${signal.direction} limit @ ${limitPrice}; dropping SL`);
        sl = null;
    }
    if (tp !== null && ((signal.direction === "BUY" && tp <= limitPrice) || (signal.direction === "SELL" && tp >= limitPrice))) {
        console.log(`[ORDER] Invalid TP ${tp} for ${signal.direction} limit @ ${limitPrice}; dropping TP`);
        tp = null;
    }
    // Actual dollar risk of this order: stop distance (absolute SL, or the SL %)
    // times the volume, for the fill notification.
    const slPct = state_1.state.settings.stopLossPercent;
    const limitRisk = (sl !== null ? Math.abs(limitPrice - sl) : limitPrice * (slPct / 100)) * (orderVolume / 100);
    let fillListenerId = "";
    let errorListenerId = "";
    let settled = false; // placement phase resolved (accepted/filled) or failed
    const placement = new Promise((resolve, reject) => {
        // If the broker never acknowledges, the order was almost certainly rejected
        // (same PROTO_OA_ERROR_RES / "Unknown payload type 2142" case as market
        // orders). Give up the placement wait — but never auto-cancel a resting
        // order just because it hasn't filled; that's the whole point of a limit.
        const placeTimeout = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            connection.removeEventListener(fillListenerId);
            connection.removeEventListener(errorListenerId);
            state_1.state.pendingOrders.delete(label);
            reject(new Error("No broker acknowledgement for limit order (likely rejected)"));
        }, 10_000);
        errorListenerId = connection.on("ProtoOAOrderErrorEvent", (event) => {
            const data = event.descriptor ?? event;
            console.log(`[ORDER] Limit OrderError for ${signal.symbol}:`, JSON.stringify(data));
            if (settled)
                return;
            settled = true;
            clearTimeout(placeTimeout);
            connection.removeEventListener(fillListenerId);
            connection.removeEventListener(errorListenerId);
            state_1.state.pendingOrders.delete(label);
            reject(new Error(`Order rejected: ${data.errorCode || "unknown"} ${data.description || ""}`));
        });
        fillListenerId = connection.on("ProtoOAExecutionEvent", (event) => {
            const data = event.descriptor ?? event;
            if (data.order?.tradeData?.label !== label)
                return;
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
                state_1.state.positions.set(positionId, {
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
                (0, livePrices_1.subscribeSpots)([symbolId]);
                connection.removeEventListener(fillListenerId);
                state_1.state.pendingOrders.delete(label);
                console.log(`[ORDER] Limit filled: ${signal.direction} ${lots} lots ${signal.symbol} @ ${entryPrice} | Position #${positionId}`);
                notifyFill("Limit order filled", signal, lots, entryPrice, positionId, limitRisk, sl, tp);
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
    }
    catch (err) {
        state_1.state.pendingOrders.delete(label);
        console.log(`[ORDER] Limit failed: ${signal.direction} ${signal.symbol} — ${err.message}`);
    }
}
//# sourceMappingURL=orders.js.map