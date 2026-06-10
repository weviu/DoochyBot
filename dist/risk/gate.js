"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSignal = processSignal;
const state_1 = require("../state");
const dailyLoss_1 = require("./dailyLoss");
const trend_1 = require("./trend");
const cooldown_1 = require("./cooldown");
const orders_1 = require("../ctrader/orders");
const reversal_1 = require("./reversal");
function processSignal(signal) {
    // Check 1: Trading paused?
    if (state_1.state.paused) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Trading paused`);
        return;
    }
    // Check 2: Symbol on the allowed list? The feed covers far more symbols than
    // the user wants traded; only symbols in the whitelist may be opened.
    if (!state_1.state.settings.allowedSymbols.includes(signal.symbol)) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Not in allowed symbols`);
        return;
    }
    // Check 2b: And does this broker actually list it? The feed also covers
    // altcoins this account simply doesn't carry, so they can't be traded.
    const resolvable = state_1.state.symbolMap.has(signal.symbol) || state_1.state.symbolMap.has(signal.symbol.replace(/USD$/, ""));
    if (!resolvable) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Not available on broker`);
        return;
    }
    // Check 3: Higher-timeframe trend filter. Feed the live price into the rolling
    // history, then reject signals that fight the trend over the lookback window.
    // Skipped when the filter is off or we don't yet have enough history (UNKNOWN).
    (0, trend_1.recordPrice)(signal.symbol, signal.price, Date.now());
    const trend = (0, trend_1.getTrend)(signal.symbol);
    if (trend === "UP" && signal.direction === "SELL") {
        console.log(`[GATE] Rejected: SELL ${signal.symbol} - Against ${state_1.state.settings.trendLookbackHours}h uptrend`);
        return;
    }
    if (trend === "DOWN" && signal.direction === "BUY") {
        console.log(`[GATE] Rejected: BUY ${signal.symbol} - Against ${state_1.state.settings.trendLookbackHours}h downtrend`);
        return;
    }
    // Check 4: Per-symbol consecutive-loss cooldown. Too many recent stop-outs on
    // this symbol → the trend likely turned, so pause it until the cooldown ends.
    const cooldown = (0, cooldown_1.getCooldown)(signal.symbol);
    if (cooldown) {
        const minsLeft = Math.ceil(cooldown.remainingMs / 60_000);
        const until = new Date(Date.now() + cooldown.remainingMs).toISOString().slice(11, 16);
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Cooldown after ${cooldown.hits} SL hits, ${minsLeft}m left (until ${until} UTC)`);
        return;
    }
    // Check 5: One position per symbol. Runs before the max-positions check so a
    // valid reversal (which closes one and opens one — net zero) is never blocked
    // by being at the position cap.
    let existingId = null;
    let existing = null;
    for (const [id, pos] of state_1.state.positions.entries()) {
        if (pos.symbol === signal.symbol) {
            existingId = id;
            existing = pos;
            break;
        }
    }
    if (existing && existingId !== null) {
        // Case A: same direction — never stack duplicates.
        if (existing.direction === signal.direction) {
            console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Already holding ${existing.direction}`);
            return;
        }
        // Case B: opposite direction — flip only if the new signal is more confident.
        const newConf = signal.confidence ?? 0;
        const oldConf = existing.confidence ?? 0;
        if (newConf <= oldConf) {
            console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Confidence too low (${newConf} vs existing ${oldConf})`);
            return;
        }
        console.log(`[GATE] Reversal: closing ${existing.direction} ${signal.symbol} (conf ${oldConf}) for ${signal.direction} (conf ${newConf})`);
        (0, reversal_1.executeReversal)(existingId, existing, signal).catch((err) => {
            console.log(`[REVERSAL] Unhandled error for ${signal.symbol}: ${err.message}`);
        });
        return;
    }
    // Check 6: Max positions reached? (Only new symbols reach here — reversals
    // already returned above.)
    if (state_1.state.positions.size >= state_1.state.settings.maxPositions) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Max positions (${state_1.state.settings.maxPositions})`);
        return;
    }
    // Check 7: Trading locked by a daily limit (loss limit or profit cap)?
    // Re-evaluate here so the profit cap catches rising floating P&L between closes.
    (0, dailyLoss_1.evaluateDailyLimits)(true);
    if ((0, dailyLoss_1.isLocked)()) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Daily limit reached (trading locked)`);
        return;
    }
    // Check 8: Duplicate signal within 60s?
    const signalKey = `${signal.symbol}:${signal.direction}`;
    const lastTime = state_1.state.lastSignalTime.get(signalKey);
    const now = Date.now();
    if (lastTime && (now - lastTime) < 60_000) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Duplicate within 60s`);
        return;
    }
    state_1.state.lastSignalTime.set(signalKey, now);
    console.log(`[GATE] Passed: ${signal.direction} ${signal.symbol}`);
    (0, orders_1.executeSignal)(signal).catch((err) => {
        console.log(`[ORDER] Unhandled error for ${signal.symbol}: ${err.message}`);
    });
}
//# sourceMappingURL=gate.js.map