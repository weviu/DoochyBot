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
                state_1.state.symbolMap.set(s.symbolName.toUpperCase(), s.symbolId);
            }
        }
        console.log(`[SYMBOLS] Loaded ${state_1.state.symbolMap.size} symbols`);
    }
    catch (err) {
        console.warn(`[SYMBOLS] Could not fetch symbols: ${err.message}`);
    }
}
//# sourceMappingURL=symbols.js.map