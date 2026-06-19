"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.existingCombinedRisk = existingCombinedRisk;
const state_1 = require("../state");
function positionPotentialLoss(entryPrice, sl, volumeCents, fallbackRisk) {
    if (sl === null || sl === undefined || !entryPrice) {
        return { potentialLoss: fallbackRisk, hasSL: false };
    }
    return { potentialLoss: Math.abs(entryPrice - sl) * (volumeCents / 100), hasSL: true };
}
// Summed potential loss of all open positions in the same symbol+direction.
// fallbackRisk (the per-trade risk target) covers positions with no SL yet.
function existingCombinedRisk(symbol, direction, fallbackRisk) {
    const positions = [];
    let existingSum = 0;
    for (const pos of state_1.state.positions.values()) {
        if (pos.symbol !== symbol || pos.direction !== direction)
            continue;
        const r = positionPotentialLoss(pos.entryPrice, pos.sl, pos.volumeCents, fallbackRisk);
        positions.push(r);
        existingSum += r.potentialLoss;
    }
    return { existingSum, positions };
}
//# sourceMappingURL=combinedRisk.js.map