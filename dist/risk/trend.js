"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPrice = recordPrice;
exports.getTrend = getTrend;
const state_1 = require("../state");
const history = new Map();
const HOUR_MS = 3_600_000;
// Record a price observation for a symbol. Called for every signal the bot sees
// so history keeps building even while the filter is disabled.
function recordPrice(symbol, price, time) {
    if (!price || price <= 0)
        return;
    let samples = history.get(symbol);
    if (!samples) {
        samples = [];
        history.set(symbol, samples);
    }
    samples.push({ time, price });
    // Retain a bit beyond the lookback so an anchor sample is always available.
    // Fall back to 4h when disabled so re-enabling has history to work with.
    const lookback = state_1.state.settings.trendLookbackHours || 4;
    const cutoff = time - lookback * HOUR_MS * 2;
    while (samples.length && samples[0].time < cutoff)
        samples.shift();
}
// Compare the latest price to the price ~N hours ago. Returns UNKNOWN when there
// isn't yet enough history (at least half the lookback) to judge — callers skip
// the filter in that case rather than block all trades.
function getTrend(symbol) {
    const lookbackHours = state_1.state.settings.trendLookbackHours;
    if (lookbackHours <= 0)
        return "UNKNOWN";
    const samples = history.get(symbol);
    if (!samples || samples.length < 2)
        return "UNKNOWN";
    const lookbackMs = lookbackHours * HOUR_MS;
    const now = samples[samples.length - 1].time;
    // Need a baseline at least half a lookback old to call it a trend.
    if (now - samples[0].time < lookbackMs / 2)
        return "UNKNOWN";
    // Anchor = the most recent sample at or before the target time; if none is
    // that old, use the oldest sample we have (already >= half the lookback).
    const target = now - lookbackMs;
    let anchor = samples[0];
    for (const s of samples) {
        if (s.time <= target)
            anchor = s;
        else
            break;
    }
    const current = samples[samples.length - 1].price;
    if (current > anchor.price)
        return "UP";
    if (current < anchor.price)
        return "DOWN";
    return "FLAT";
}
//# sourceMappingURL=trend.js.map