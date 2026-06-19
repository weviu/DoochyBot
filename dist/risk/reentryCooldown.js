"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLoss = recordLoss;
exports.getReentryCooldown = getReentryCooldown;
exports.formatRemaining = formatRemaining;
const state_1 = require("../state");
// Re-entry cooldown after a loss (InstantFunding prop-firm "same trade idea"
// rule). When a position closes at a loss, reopening the SAME symbol AND
// direction within a window counts as the same trade idea, and the combined loss
// counts toward the per-trade risk limit. To stay compliant we block re-entry on
// that symbol+direction for reentryCooldownMinutes after the losing close.
//
// Distinct from the consecutive-loss cooldown in cooldown.ts: that one pauses a
// symbol (either direction) after several SL hits; this one fires on a SINGLE
// loss and is direction-specific. Wins never trigger it, and the opposite
// direction is a separate trade idea so it is never blocked here.
//
// In-memory only (stored in state.lossReentry). On restart it resets, which is
// acceptable for a compliance guard.
const MIN_MS = 60_000;
function key(symbol, direction) {
    return `${symbol}:${direction}`;
}
// Record a losing close. Stores the close time, keyed by symbol+direction.
function recordLoss(symbol, direction, time = Date.now()) {
    state_1.state.lossReentry.set(key(symbol, direction), time);
    const mins = state_1.state.settings.reentryCooldownMinutes;
    if (mins > 0) {
        console.log(`[REENTRY] ${direction} ${symbol} closed at a loss - re-entry blocked for ${mins}m`);
    }
}
// Remaining cooldown in ms for a symbol+direction, or null if none / expired /
// disabled. Expired entries are cleared lazily on access.
function getReentryCooldown(symbol, direction, now = Date.now()) {
    const mins = state_1.state.settings.reentryCooldownMinutes;
    if (mins <= 0)
        return null; // disabled
    const k = key(symbol, direction);
    const closedAt = state_1.state.lossReentry.get(k);
    if (closedAt === undefined)
        return null;
    const remaining = closedAt + mins * MIN_MS - now;
    if (remaining <= 0) {
        state_1.state.lossReentry.delete(k);
        return null;
    }
    return remaining;
}
// Format a remaining duration as "7m 23s".
function formatRemaining(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
}
//# sourceMappingURL=reentryCooldown.js.map