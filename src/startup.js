const { config } = require('./config');
const { loadSettings } = require('./storage');
const { fetchSymbols } = require('./ctrader/symbols');
const { fetchAccountInfo } = require('./ctrader/account');
const state = require('./state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function fmtPnL(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

async function syncPositions(connection) {
  const response = await connection.sendCommand('ProtoOAReconcileReq', {
    ctidTraderAccountId: config.ctrader.accountId,
  });

  const positions = response.position || [];
  for (const pos of positions) {
    const tradeData = pos.tradeData || {};
    state.positions.set(pos.positionId, {
      symbol: tradeData.symbolName || String(tradeData.symbolId),
      direction: tradeData.tradeSide === 2 ? 'SELL' : 'BUY',
      volume: (tradeData.volume || 0) / 100,
      entryPrice: pos.price,
      sl: pos.stopLoss || null,
      tp: pos.takeProfit || null,
      openTime: tradeData.openTimestamp ? Number(tradeData.openTimestamp) : null,
    });
  }
  log(`Synced ${state.positions.size} open positions from cTrader`);
}

async function syncDailyPnL(connection) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const response = await connection.sendCommand('ProtoOADealListReq', {
    ctidTraderAccountId: config.ctrader.accountId,
    fromTimestamp: todayStart.getTime(),
    toTimestamp: Date.now(),
    maxRows: 500,
  });

  const deals = response.deal || [];
  let total = 0;
  for (const deal of deals) {
    if (deal.closePositionDetail) {
      total += (deal.closePositionDetail.grossProfit || 0) / 100;
    }
  }
  state.dailyRealizedPnL = total;
  log(`Daily realized P&L: ${fmtPnL(total)}`);
}

async function runStartup(connection) {
  try {
    loadSettings();
  } catch (err) {
    log(`Fatal: failed to load settings: ${err.message}`);
    process.exit(1);
  }

  try {
    await fetchSymbols(connection);
  } catch (err) {
    log(`Fatal: failed to fetch symbols: ${err.message || JSON.stringify(err)}`);
    process.exit(1);
  }

  try {
    await fetchAccountInfo(connection);
  } catch (err) {
    log(`Warning: failed to fetch account info: ${err.message || JSON.stringify(err)}`);
  }

  try {
    await syncPositions(connection);
  } catch (err) {
    log(`Warning: failed to sync positions: ${err.message || JSON.stringify(err)}`);
  }

  try {
    await syncDailyPnL(connection);
  } catch (err) {
    log(`Warning: failed to sync daily P&L, starting at $0.00: ${err.message || JSON.stringify(err)}`);
    state.dailyRealizedPnL = 0;
  }

  log(`Bot ready. ${state.positions.size} positions open. Daily P&L: ${fmtPnL(state.dailyRealizedPnL)}. ${state.symbolMap.size} symbols available.`);
}

module.exports = { runStartup };
