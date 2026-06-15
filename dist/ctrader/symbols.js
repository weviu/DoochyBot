"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSymbols = fetchSymbols;
const state_1 = require("../state");
async function fetchSymbols(connection) {
    try {
        const res = await connection.sendCommand("ProtoOASymbolsListReq", {
            ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            includeArchivedSymbols: false,
        });
        const symbols = res.symbol || [];
        for (const s of symbols) {
            if (s.symbolName && s.symbolId) {
                // The cTrader layer decodes int64 fields (symbolId) as STRINGS. Coerce to
                // Number so symbolMap honours its declared Map<string, number> type. This
                // matters because the live-price quotes map is keyed by Number(symbolId);
                // a string here makes quotes.get(symbolMap.get(sym)) silently miss, which
                // is why floating P&L read 0 (mark fell back to entry price).
                state_1.state.symbolMap.set(s.symbolName.toUpperCase(), Number(s.symbolId));
            }
        }
        console.log(`[SYMBOLS] Loaded ${state_1.state.symbolMap.size} symbols`);
    }
    catch (err) {
        console.warn(`[SYMBOLS] Could not fetch symbols: ${err.message}`);
    }
}
//# sourceMappingURL=symbols.js.map