"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAccountInfo = fetchAccountInfo;
const state_1 = require("../state");
function fetchAccountInfo(connection) {
    console.log(`[ACCOUNT] Account ID: ${process.env.ACCOUNT_ID}`);
    state_1.state.accountInfo = {
        balance: 10000, // Will be updated when we get real balance
        equity: 10000,
        currency: "USD",
    };
}
//# sourceMappingURL=account.js.map