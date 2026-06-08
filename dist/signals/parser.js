"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSignal = parseSignal;
const SYMBOL_ALIASES = {
    AAVE: "AAVUSD",
    ALGO: "ALGUSD",
    AVAX: "AVAUSD",
    LINK: "LNKUSD",
};
function resolveSymbol(raw) {
    const base = raw.split("/")[0].toUpperCase();
    if (!base)
        return null;
    return SYMBOL_ALIASES[base] || `${base}USD`;
}
function parseSignal(alert) {
    const symbol = resolveSymbol(alert.symbol);
    if (!symbol)
        return null;
    const dir = alert.direction.toUpperCase();
    if (dir !== "BUY" && dir !== "SELL")
        return null;
    return {
        symbol,
        direction: dir,
        rsi: alert.rsi,
        price: alert.price,
        pivotLevel: alert.pivot_level,
        pivotDistance: alert.pivot_distance,
        confidence: alert.confidence ?? 0,
        timeframe: alert.timeframe,
        timestamp: alert.timestamp,
    };
}
//# sourceMappingURL=parser.js.map