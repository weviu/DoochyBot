import { state } from "../../state";
import { getConnection, getSymbolSpec } from "../../ctrader/orders";

export async function positionsCmd(ctx: any) {
  const connection = getConnection();

  if (state.positions.size === 0) {
    await ctx.reply("No open positions.");
    return;
  }

  // Re-reconcile to get current mark prices from the broker. Falls back to the
  // in-memory entry price (P&L shows as 0) if the request fails.
  const markPrices = new Map<number, number>(); // positionId → current mark price
  const slMap = new Map<number, number | null>();
  const tpMap = new Map<number, number | null>();

  if (connection) {
    try {
      const res = await connection.sendCommand("ProtoOAReconcileReq", {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      });
      for (const p of res.position || []) {
        markPrices.set(p.positionId, Number(p.price) || 0);
        slMap.set(p.positionId, p.stopLoss ?? null);
        tpMap.set(p.positionId, p.takeProfit ?? null);
      }
    } catch {
      // Non-fatal — P&L will be unknown
    }
  }

  const lines: string[] = [];
  let totalPnL = 0;

  for (const [posId, pos] of state.positions.entries()) {
    const markPrice = markPrices.get(posId) ?? pos.entryPrice;
    const sl = slMap.get(posId) ?? pos.sl;
    const tp = tpMap.get(posId) ?? pos.tp;

    // Unrealized P&L = price move × lots × lot-size-in-units.
    // We need the lotSize (units per lot) from the symbol spec to convert
    // volume to a notional. If unavailable, fall back to displaying "?".
    let pnlStr = "?";
    const symbolId = state.symbolMap.get(pos.symbol);
    if (symbolId !== undefined && markPrice && pos.entryPrice) {
      try {
        const spec = await getSymbolSpec(symbolId);
        if (spec?.lotSize) {
          const priceDiff = pos.direction === "BUY"
            ? markPrice - pos.entryPrice
            : pos.entryPrice - markPrice;
          // spec.lotSize is in broker volume cents per lot; divide by 100 to get
          // the notional units, then multiply by price diff to get rough P&L.
          // This is an approximation for non-USD-quoted pairs, but good enough
          // for a live glance.
          const units = (pos.volumeCents / 100);
          const pnl = priceDiff * units;
          totalPnL += pnl;
          pnlStr = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`;
        }
      } catch {
        // Leave as "?"
      }
    }

    const fmt = (v: number | null | undefined) =>
      v != null ? String(v) : "—";

    lines.push(
      `${pos.direction} ${pos.symbol} ${pos.volume}L\n` +
      `  Entry: ${pos.entryPrice}  Mark: ${markPrice || "?"}\n` +
      `  SL: ${fmt(sl)}  TP: ${fmt(tp)}\n` +
      `  P&L: ${pnlStr}`
    );
  }

  const summary = `Open positions (${state.positions.size}):\n\n` +
    lines.join("\n\n") +
    (state.positions.size > 1 ? `\n\nTotal P&L: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}` : "");

  await ctx.reply(summary);
}
