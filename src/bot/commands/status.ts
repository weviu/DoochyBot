import { state } from "../../state";
import { fetchTrader, fetchTodayRealizedPnL } from "../../ctrader/account";
import { activeCooldowns } from "../../risk/cooldown";
import { floatingPnL } from "../../risk/dailyLoss";
import { getSymbolSpec } from "../../ctrader/orders";

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

  // Compute floating P&L from live broker mark prices (reconcile), not feed
  // prices — feed prices are absent right after a restart until first signal.
  let liveFloating = 0;
  if (connOk && state.positions.size > 0) {
    try {
      const res = await connection.sendCommand("ProtoOAReconcileReq", {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
      });
      for (const p of res.position || []) {
        const tracked = state.positions.get(p.positionId);
        if (!tracked) continue;
        const mark = Number(p.price) || 0;
        if (!mark || !tracked.entryPrice) continue;
        const symbolId = state.symbolMap.get(tracked.symbol);
        if (symbolId === undefined) continue;
        const spec = await getSymbolSpec(symbolId);
        if (!spec?.lotSize) continue;
        const diff = tracked.direction === "BUY" ? mark - tracked.entryPrice : tracked.entryPrice - mark;
        liveFloating += diff * (tracked.volumeCents / 100);
      }
    } catch {
      liveFloating = floatingPnL(); // fall back to feed-price estimate
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
    `Floating P&L: ${liveFloating >= 0 ? "+" : ""}${liveFloating.toFixed(2)} ${info.currency}`,
    `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)} (total ${(dailyPnL + liveFloating).toFixed(2)} used)` : "off"}`,
    `Trend filter: ${state.settings.trendLookbackHours > 0 ? `${state.settings.trendLookbackHours}h` : "off"}`,
    `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
    `Allowed symbols: ${state.settings.allowedSymbols.length}`,
  ];
  await ctx.reply(lines.join("\n"));
}
