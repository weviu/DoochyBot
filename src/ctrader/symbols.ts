import { state } from "../state";

export async function fetchSymbols(connection: any): Promise<void> {
  try {
    const res = await connection.sendCommand("ProtoOASymbolsListReq", {
      ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      includeArchivedSymbols: false,
    });

    const symbols: any[] = res.symbol || [];
    for (const s of symbols) {
      if (s.symbolName && s.symbolId) {
        state.symbolMap.set(s.symbolName.toUpperCase(), s.symbolId);
      }
    }
    console.log(`[SYMBOLS] Loaded ${state.symbolMap.size} symbols`);
  } catch (err: any) {
    console.warn(`[SYMBOLS] Could not fetch symbols: ${err.message}`);
  }
}