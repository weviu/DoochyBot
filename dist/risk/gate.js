"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSignal = processSignal;
const state_1 = require("../state");
const dailyLoss_1 = require("./dailyLoss");
const orders_1 = require("../ctrader/orders");
function processSignal(signal) {
    // Check 1: Trading paused?
    if (state_1.state.paused) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Trading paused`);
        return;
    }
    // Check 2: Symbol available on cTrader?
    const resolvable = state_1.state.symbolMap.has(signal.symbol) || state_1.state.symbolMap.has(signal.symbol.replace(/USD$/, ""));
    if (!resolvable) {
        return;
    }
    // Check 3: Max positions reached?
    if (state_1.state.positions.size >= state_1.state.settings.maxPositions) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Max positions (${state_1.state.settings.maxPositions})`);
        return;
    }
    // Check 4: Trading locked by daily loss limit?
    if ((0, dailyLoss_1.isLocked)()) {
        console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} -   Daily loss limit reached`);
        return;
    }
    // Check 5: Duplicate signal within 60s?
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