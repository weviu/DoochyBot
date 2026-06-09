"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrader = fetchTrader;
exports.fetchAccountInfo = fetchAccountInfo;
const state_1 = require("../state");
// Pull live trader data (balance) from the broker. Throws on failure so callers
// that want a health check can detect a dead connection.
async function fetchTrader(connection) {
    const res = await connection.sendCommand("ProtoOATraderReq", {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
    });
    const t = res.trader;
    if (!t)
        throw new Error("No trader data in response");
    // Money fields are integers scaled by 10^moneyDigits.
    const div = Math.pow(10, Number(t.moneyDigits ?? 2));
    const balance = Number(t.balance || 0) / div;
    state_1.state.accountInfo = {
        balance,
        equity: balance, // equity needs unrealized P&L (live prices); use balance as a proxy
        currency: state_1.state.accountInfo.currency || "USD",
    };
    return state_1.state.accountInfo;
}
// Boot-time fetch. Never throws — a failure here must not crash startup.
async function fetchAccountInfo(connection) {
    console.log(`[ACCOUNT] Account ID: ${process.env.ACCOUNT_ID}`);
    try {
        const info = await fetchTrader(connection);
        console.log(`[ACCOUNT] Balance: ${info.balance} ${info.currency}`);
    }
    catch (err) {
        console.warn(`[ACCOUNT] Could not fetch trader: ${err.errorCode || err.message || "request failed"}`);
    }
    return state_1.state.accountInfo;
}
//# sourceMappingURL=account.js.map