import { state, AccountInfo } from "../state";

// Pull live trader data (balance) from the broker. Throws on failure so callers
// that want a health check can detect a dead connection.
export async function fetchTrader(connection: any): Promise<AccountInfo> {
  const res = await connection.sendCommand("ProtoOATraderReq", {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
  });
  const t = res.trader;
  if (!t) throw new Error("No trader data in response");

  // Money fields are integers scaled by 10^moneyDigits.
  const div = Math.pow(10, Number(t.moneyDigits ?? 2));
  const balance = Number(t.balance || 0) / div;

  state.accountInfo = {
    balance,
    equity: balance, // equity needs unrealized P&L (live prices); use balance as a proxy
    currency: state.accountInfo.currency || "USD",
  };
  return state.accountInfo;
}

// Boot-time fetch. Never throws — a failure here must not crash startup.
export async function fetchAccountInfo(connection: any): Promise<AccountInfo> {
  console.log(`[ACCOUNT] Account ID: ${process.env.ACCOUNT_ID}`);
  try {
    const info = await fetchTrader(connection);
    console.log(`[ACCOUNT] Balance: ${info.balance} ${info.currency}`);
  } catch (err: any) {
    console.warn(`[ACCOUNT] Could not fetch trader: ${err.errorCode || err.message || "request failed"}`);
  }
  return state.accountInfo;
}
