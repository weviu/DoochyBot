import { state } from "../../state";
import { fetchTrader, fetchTodayRealizedPnL } from "../../ctrader/account";
import { activeCooldowns } from "../../risk/cooldown";
import { floatingPnL, maxLossUSD } from "../../risk/dailyLoss";

let connection: any = null;

export function setStatusConnection(conn: any): void {
  connection = conn;
}

export async function statusCmd(ctx: any) {
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

  let dailyPnL = state.dailyRealizedPnL;
  if (connOk) {
    try {
      dailyPnL = await fetchTodayRealizedPnL(connection);
    } catch {
      dailyPnL = state.dailyRealizedPnL;
    }
  }

  // Feed prices (recordPrice) are updated on every signal that passes through gate.
  // Immediately after restart they're seeded with entry prices until the first
  // signal for each symbol arrives, so floating may show ~0 briefly.
  const liveFloating = floatingPnL();

  const cap = state.settings.dailyProfitCapUSD;
  const cooldowns = activeCooldowns();
  const lines = [
    `cTrader: ${connOk ? "connected" : "not connected"}`,
    `Account: ${process.env.ACCOUNT_ID || "?"}`,
    `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
    `Trading: ${state.paused ? "paused" : "active"}${state.tradingLocked ? " (locked)" : ""}`,
    `Open positions: ${state.positions.size}/${state.settings.maxPositions}`,
    `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
    `Floating P&L: ${liveFloating >= 0 ? "+" : ""}${liveFloating.toFixed(2)} ${info.currency}`,
    `Profit cap: ${cap > 0 ? `$${cap.toFixed(2)} (total ${(dailyPnL + liveFloating).toFixed(2)} used)` : "off"}`,
    `Daily loss limit: -$${maxLossUSD().toFixed(2)} (force-close all)`,
    `Sizing: ${state.settings.riskPerTradeUSD > 0 ? `$${state.settings.riskPerTradeUSD.toFixed(2)} risk/trade @ ${state.settings.stopLossPercent}% SL / ${state.settings.takeProfitPercent}% TP` : "not set - /risk pertrade required to trade"}`,
    `Cooldowns: ${cooldowns.length === 0 ? "none" : cooldowns.map((c) => `${c.symbol} ${Math.ceil(c.remainingMs / 60_000)}m`).join(", ")}`,
    `Allowed symbols: ${state.settings.allowedSymbols.length}`,
  ];
  await ctx.reply(lines.join("\n"));
}
