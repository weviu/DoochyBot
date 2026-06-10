import { state } from "../../state";
import { getLatestPrice } from "../../risk/trend";

export async function positionsCmd(ctx: any) {
  if (state.positions.size === 0) {
    await ctx.reply("No open positions.");
    return;
  }

  const lines: string[] = [];
  let totalPnL = 0;

  for (const [posId, pos] of state.positions.entries()) {
    const sl = pos.sl;
    const tp = pos.tp;

    // Feed price from the trend buffer (updated on every signal via recordPrice).
    // Falls back to entry if no signal has arrived for this symbol yet.
    const mark = getLatestPrice(pos.symbol) ?? pos.entryPrice;
    const priceDiff = pos.direction === "BUY" ? mark - pos.entryPrice : pos.entryPrice - mark;
    const units = pos.volumeCents / 100;
    const pnl = priceDiff * units;
    totalPnL += pnl;
    const pnlStr = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`;

    const fmt = (v: number | null | undefined) =>
      v != null ? String(v) : "—";

    lines.push(
      `${pos.direction} ${pos.symbol} ${pos.volume}L\n` +
      `  Entry: ${pos.entryPrice}  Mark: ${mark}\n` +
      `  SL: ${fmt(sl)}  TP: ${fmt(tp)}\n` +
      `  P&L: ${pnlStr}`
    );
  }

  const summary = `Open positions (${state.positions.size}):\n\n` +
    lines.join("\n\n") +
    (state.positions.size > 1 ? `\n\nTotal P&L: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}` : "");

  await ctx.reply(summary);
}
