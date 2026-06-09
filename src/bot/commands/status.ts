import { state } from "../../state";
import { fetchTrader } from "../../ctrader/account";

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

  const lines = [
    `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
    `Account: ${process.env.ACCOUNT_ID || "?"}`,
    `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
    `Trading: ${state.paused ? "⏸ paused" : "▶️ active"}${state.tradingLocked ? " (locked)" : ""}`,
    `Open positions: ${state.positions.size}/${state.settings.maxPositions}`,
    `Daily realized P&L: ${state.dailyRealizedPnL >= 0 ? "+" : ""}${state.dailyRealizedPnL.toFixed(2)} ${info.currency}`,
    `Symbols loaded: ${state.symbolMap.size}`,
    `Allowed symbols: ${state.settings.allowedSymbols.length}`,
  ];
  await ctx.reply(lines.join("\n"));
}
