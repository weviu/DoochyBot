"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTrader = fetchTrader;
exports.fetchTodayRealizedPnL = fetchTodayRealizedPnL;
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
// Net realized P&L for closed deals since 00:00 UTC today, read live from the
// broker. Authoritative source for the daily loss/profit limits and /status,
// since the in-memory counter resets on restart.
async function fetchTodayRealizedPnL(connection) {
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
        if (!cpd)
            continue;
        const div = Math.pow(10, Number(cpd.moneyDigits ?? 2));
        net += (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / div;
    }
    return net;
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