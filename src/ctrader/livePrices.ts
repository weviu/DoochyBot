import { state } from "../state";

// Live mark prices straight from cTrader's spot stream. This is the ONLY
// real-time price source we have — the HTTP signal feed only updates a symbol
// when an alert for it fires, so it's stale/absent for P&L. ProtoOAReconcileReq
// returns the ENTRY price, not the mark. So for accurate floating P&L (and the
// profit cap's realized+floating check) we keep a persistent spot subscription
// for every symbol we hold a position in.

let connection: any = null;

// symbolId → latest { bid, ask } in real price units (already de-scaled).
interface Quote { bid: number; ask: number; time: number; }
const quotes = new Map<number, Quote>();

// symbolIds we've already asked the broker to stream.
const subscribed = new Set<number>();

// ProtoOASpotEvent bid/ask are integers in 1/100000 of a price unit.
const SPOT_SCALE = 100_000;

export function setLivePriceConnection(conn: any): void {
  connection = conn;

  conn.on("ProtoOASpotEvent", (event: any) => {
    const data = event.descriptor ?? event;
    const symId = Number(data.symbolId);
    if (!symId) return;

    const prev = quotes.get(symId) ?? { bid: 0, ask: 0, time: 0 };
    // Spot events only carry whichever side changed; keep the other side.
    const bid = data.bid != null ? Number(data.bid) / SPOT_SCALE : prev.bid;
    const ask = data.ask != null ? Number(data.ask) / SPOT_SCALE : prev.ask;
    quotes.set(symId, { bid, ask, time: Date.now() });
  });
}

// Subscribe to spot updates for the given symbolIds (idempotent). Safe to call
// repeatedly — already-subscribed ids are skipped.
export async function subscribeSpots(symbolIds: number[]): Promise<void> {
  if (!connection) return;
  const fresh = symbolIds.filter((id) => id && !subscribed.has(id));
  if (!fresh.length) return;
  try {
    await connection.sendCommand("ProtoOASubscribeSpotsReq", {
      ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      symbolId: fresh,
    });
    fresh.forEach((id) => subscribed.add(id));
    console.log(`[SPOT] Subscribed to ${fresh.length} symbol(s): ${fresh.join(",")}`);
  } catch (err: any) {
    console.warn(`[SPOT] Subscribe failed for ${fresh.join(",")}: ${err.errorCode || err.message || "request failed"}`);
  }
}

// Ensure every symbol with an open position is being streamed. Call on boot
// (after reconcile) and whenever a new position opens.
export async function subscribeOpenPositions(): Promise<void> {
  const ids = [...new Set(
    [...state.positions.values()]
      .map((p) => state.symbolMap.get(p.symbol))
      .filter((id): id is number => id !== undefined)
  )];
  await subscribeSpots(ids);
}

// Mark price for closing a position of the given direction:
//   BUY  closes at the bid (you sell to close)
//   SELL closes at the ask (you buy to close)
// This matches how cTrader computes the "Net USD" figure shown in the UI.
export function getMarkPrice(symbol: string, direction: "BUY" | "SELL"): number | null {
  const symId = state.symbolMap.get(symbol);
  if (symId === undefined) return null;
  const q = quotes.get(symId);
  if (!q) return null;
  const price = direction === "BUY" ? q.bid : q.ask;
  return price > 0 ? price : null;
}

// Has a live quote for this symbol arrived yet?
export function hasLiveQuote(symbol: string): boolean {
  const symId = state.symbolMap.get(symbol);
  if (symId === undefined) return false;
  return quotes.has(symId);
}
