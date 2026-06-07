const state = require('../state');
const { updateDailyPnL } = require('../risk/dailyLoss');
const { appendTrade } = require('../storage');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function calcPnL(pos, exitPrice) {
  if (!pos) return 0;
  const contractSize = state.symbolMap.get(pos.symbol)?.contractSize || 100000;
  const raw = (exitPrice - pos.entryPrice) * pos.volume * contractSize * 0.01;
  return pos.direction === 'BUY' ? raw : -raw;
}

function setupEventListeners(connection) {
  connection.on('ProtoOAExecutionEvent', (msg) => {
    const isClose = msg.deal?.closingOrder === true || msg.deal?.closePositionDetail != null;
    if (msg.executionType !== 'ORDER_FILLED' || !isClose) return;

    const positionId = msg.position?.positionId;
    const exitPrice = msg.deal?.executionPrice;
    const existingPos = state.positions.get(positionId);

    let pnl;
    if (msg.deal?.closePositionDetail?.grossProfit != null) {
      pnl = msg.deal.closePositionDetail.grossProfit / 100;
    } else {
      pnl = calcPnL(existingPos, exitPrice);
    }

    if (existingPos) {
      const holdTime = existingPos.openTime
        ? Math.round((Date.now() - existingPos.openTime) / 1000)
        : null;

      log(`Position closed: ${existingPos.direction} ${existingPos.symbol} #${positionId} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);

      appendTrade({
        timestamp: new Date().toISOString(),
        symbol: existingPos.symbol,
        direction: existingPos.direction,
        volume: existingPos.volume,
        entryPrice: existingPos.entryPrice,
        exitPrice,
        pnl,
        positionId,
        orderId: msg.deal?.orderId || null,
        sl: existingPos.sl,
        tp: existingPos.tp,
        holdTime,
        source: 'close',
      });

      state.positions.delete(positionId);
      const pnlSign = pnl >= 0 ? '+' : '';
      require('../bot/bot').sendAlert(
        `${existingPos.symbol} ${existingPos.direction} closed | P&L: ${pnlSign}$${Math.abs(pnl).toFixed(2)} | Daily P&L: ${pnlSign}$${Math.abs(state.dailyRealizedPnL + pnl).toFixed(2)}`
      );
    } else {
      log(`External close detected: position #${positionId}`);
    }

    updateDailyPnL(pnl);
  });
}

module.exports = { setupEventListeners };
