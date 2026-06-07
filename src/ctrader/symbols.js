const { config } = require('../config');
const state = require('../state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function fetchSymbols(connection) {
  const response = await connection.sendCommand('ProtoOASymbolsListReq', {
    ctidTraderAccountId: config.ctrader.accountId,
    includeArchivedSymbols: false,
  });

  const symbols = response.symbol || [];
  const map = new Map();
  for (const sym of symbols) {
    const name = (sym.symbolName || '').toUpperCase();
    if (name) {
      map.set(name, {
        symbolId: sym.symbolId,
        lotSize: sym.lotSize,
        contractSize: sym.contractSize,
      });
    }
  }

  state.symbolMap = map;
  console.log(`[${ts()}] Loaded ${map.size} symbols from cTrader`);
  return map;
}

module.exports = { fetchSymbols };
