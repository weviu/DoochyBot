import { state } from "../state";

export function fetchAccountInfo(connection: any): void {
  console.log(`[ACCOUNT] Account ID: ${process.env.ACCOUNT_ID}`);
  state.accountInfo = {
    balance: 10000, // Will be updated when we get real balance
    equity: 10000,
    currency: "USD",
  };
}