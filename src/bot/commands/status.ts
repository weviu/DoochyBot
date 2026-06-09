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

// Net realized P&L for closed deals since 00:00 UTC today, read live from the
// broker. We don't trust the in-memory counter — it only reflects closes the
// bot witnessed this session and is zero after a restart.
async function todayRealizedPnL(): Promise<number> {
  const now = new Date();
  const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const res = await connection.sendCommand("ProtoOADealListReq", {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
    fromTimestamp: startOfDay,
    toTimestamp: now.getTime(),
    maxRows: 1000,
  });
  let net = 0;
  for (const d of res.deal || []) {
    const cpd = d.closePositionDetail; // only closing deals carry realized P&L
    if (!cpd) continue;
    const div = Math.pow(10, Number(cpd.moneyDigits ?? 2));
    net += (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / div;
  }
  return net;
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
      dailyPnL = await todayRealizedPnL();
    } catch {
      dailyPnL = state.dailyRealizedPnL;
    }
  }

  const lines = [
    `cTrader: ${connOk ? "✅ connected" : "❌ not connected"}`,
    `Account: ${process.env.ACCOUNT_ID || "?"}`,
    `Balance: ${info.balance.toFixed(2)} ${info.currency}`,
    `Trading: ${state.paused ? "⏸ paused" : "▶️ active"}${state.tradingLocked ? " (locked)" : ""}`,
    `Open positions: ${state.positions.size}/${state.settings.maxPositions}`,
    `Daily realized P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} ${info.currency}`,
    `Allowed symbols: ${state.settings.allowedSymbols.length}`,
  ];
  await ctx.reply(lines.join("\n"));
}
