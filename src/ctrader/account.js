const { config } = require('../config');
const state = require('../state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function fetchAccountInfo(connection) {
  const response = await connection.sendCommand('ProtoOATraderReq', {
    ctidTraderAccountId: config.ctrader.accountId,
  });

  const trader = response.trader || response;
  const divisor = 100;

  const info = {
    balance: (trader.balance || 0) / divisor,
    equity: (trader.balance || 0) / divisor,
    margin: (trader.marginUsed || 0) / divisor,
    freeMargin: ((trader.balance || 0) - (trader.marginUsed || 0)) / divisor,
    currency: trader.depositAsset?.name || 'USD',
  };

  state.accountInfo = info;
  console.log(`[${ts()}] Account: $${info.equity.toFixed(2)} equity | $${info.freeMargin.toFixed(2)} free margin`);
  return info;
}

module.exports = { fetchAccountInfo };
