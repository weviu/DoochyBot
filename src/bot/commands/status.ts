import { state } from "../../state";
import { fetchTrader, fetchTodayRealizedPnL } from "../../ctrader/account";
import { activeCooldowns } from "../../risk/cooldown";
import { floatingPnL } from "../../risk/dailyLoss";

let connection: any = null;

export function setStatusConnection(conn: any): void {
  connection = conn;
}

export async function balanceCmd(ctx: any) {
  if (!connection) {
    await ctx.reply("No cTrader connection.");
    return;
  }
  try {
    const info = await fetchTrader(connection);
    await ctx.reply(`Balance: ${info.balance.toFixed(2)} ${info.currency}`);
  } catch (err: any) {
    await ctx.reply(`Failed to fetch balance: ${err.errorCode || err.message || "request failed"}`);
  }
}

export async function statusCmd(ctx: any) {
  // Health check: a live ProtoOATraderReq confirms the cTrader link is alive.
  let connOk = false;
  let info = state.accountInfo;
  if (connection) {
    try {
      info = await fetchTrader(connection);
      connOk = true;
    } catch {
      connOk = false;
    }
  }

  // Pull today's realized P&L from the broker; fall back to the in-memory
  // counter if the request fails.
  let dailyPnL = state.dailyRealizedPnL;
  if (connOk) {
    try {
      dailyPnL = await fetchTodayRealizedPnL(connection);
    } catch {
      dailyPnL = state.dailyRealizedPnL;
    }
  }

  const cap = state.settings.dailyProfitCapUSD;
  const cooldowns = activeCooldowns();
  const lines = [
    `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
    `Account: ${process.env.ACCOUNT_ID || "?"}`,
    `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
    `Trading: ${state.paused ? "⏸ paused" : "▶️ active"}${state.tradingLocked ? " 🔒 locked" : ""}`,
    `Open positions: ${state.positions.size}/${state.settings.maxPositions}`,
    `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
    `Floating P&L: ${(() => { const f = floatingPnL(); return `${f >= 0 ? "+" : ""}${f.toFixed(2)}`; })()} ${info.currency}`,
    `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)} (total ${(dailyPnL + floatingPnL()).toFixed(2)} used)` : "off"}`,
    `Trend filter: ${state.settings.trendLookbackHours > 0 ? `${state.settings.trendLookbackHours}h` : "off"}`,
    `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
    `Allowed symbols: ${state.settings.allowedSymbols.length}`,
  ];
  await ctx.reply(lines.join("\n"));
}
