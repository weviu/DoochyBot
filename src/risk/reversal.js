const { config } = require('../config');
const state = require('../state');
const { updateDailyPnL } = require('./dailyLoss');
const { appendTrade } = require('../storage');

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

function checkReversal(signal) {
  for (const [positionId, pos] of state.positions) {
    if (pos.symbol === signal.symbol && pos.direction !== signal.direction) {
      log(`Reversal signal detected: ${signal.direction} ${signal.symbol} would close existing ${pos.direction} #${positionId}`);
      return { isReversal: true, existingPosition: { positionId, ...pos } };
    }
  }
  return { isReversal: false };
}

async function executeReversal(signal, existingPosition, connection) {
  const { positionId, symbol, direction: oldDirection, volume, openTime, confidence: existingConfidence } = existingPosition;
  const minHold = state.settings.minHoldSeconds ?? 60;

  // Step 1 - Validate
  const ageSeconds = Math.round((Date.now() - openTime) / 1000);
  if (ageSeconds < minHold) {
    log(`Reversal blocked - existing position too new (opened ${ageSeconds}s ago, min hold: ${minHold}s)`);
    return;
  }

  if (existingConfidence != null && signal.confidence != null) {
    if (signal.confidence <= existingConfidence) {
      log(`Reversal blocked - new signal confidence (${signal.confidence}) not higher than existing (${existingConfidence})`);
      return;
    }
    log(`Reversal conditions: cooldown OK (${ageSeconds}s > ${minHold}s), confidence OK (${signal.confidence} > ${existingConfidence})`);
  } else {
    log(`Confluence check skipped - missing confidence data`);
    log(`Reversal conditions: cooldown OK (${ageSeconds}s > ${minHold}s)`);
  }

  require('../bot/bot').sendAlert(`Reversal started: closing ${oldDirection} #${positionId}, opening ${signal.direction} ${symbol}`);

  // Step 2 - Close existing
  const ctraderVolume = Math.round(volume * 100000);

  const closePromise = new Promise((resolve, reject) => {
    let listenerUuid;
    const timeout = setTimeout(() => {
      connection.removeEventListener(listenerUuid);
      reject(new Error('Close order timeout - 30s elapsed'));
    }, 30000);

    listenerUuid = connection.on('ProtoOAExecutionEvent', (msg) => {
      const isClose = msg.deal?.closingOrder === true || msg.deal?.closePositionDetail != null;
      if (
        msg.executionType === 'ORDER_FILLED' &&
        isClose &&
        msg.position?.positionId === positionId
      ) {
        clearTimeout(timeout);
        connection.removeEventListener(listenerUuid);
        resolve(msg);
      }
    });
  });

  connection.sendCommand('ProtoOAPositionCloseReq', {
    ctidTraderAccountId: config.ctrader.accountId,
    positionId,
    volume: ctraderVolume,
  });

  let closeEvent;
  try {
    closeEvent = await closePromise;
  } catch (err) {
    log(`Reversal failed - could not close existing position: ${err.message}`);
    require('../bot/bot').sendAlert(`Reversal failed - could not close ${oldDirection} ${symbol}: ${err.message}`);
    return;
  }

  const exitPrice = closeEvent.deal?.executionPrice;
  const pnl = closeEvent.deal?.closePositionDetail?.grossProfit != null
    ? closeEvent.deal.closePositionDetail.grossProfit / 100
    : 0;

  log(`Reversal: closed ${oldDirection} ${symbol} #${positionId} @ ${exitPrice} | P&L: ${fmtPnL(pnl)}`);

  state.positions.delete(positionId);
  updateDailyPnL(pnl);

  appendTrade({
    timestamp: new Date().toISOString(),
    symbol,
    direction: oldDirection,
    volume,
    entryPrice: existingPosition.entryPrice,
    exitPrice,
    pnl,
    positionId,
    orderId: closeEvent.deal?.orderId || null,
    sl: existingPosition.sl,
    tp: existingPosition.tp,
    holdTime: ageSeconds,
    source: 'reversal_close',
  });

  // Step 3 - Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // Step 4 - Open new
  const { executeSignal } = require('../ctrader/orders');
  try {
    await executeSignal(signal);
    log(`Reversal complete: ${signal.direction} ${symbol}`);
    require('../bot/bot').sendAlert(`Reversal: closed ${oldDirection} ${symbol} (${fmtPnL(pnl)}) opened ${signal.direction} ${symbol}`);
  } catch (err) {
    log(`CRITICAL: Reversal close succeeded but open failed. Old position closed, new position NOT opened. ${err.message}`);
    require('../bot/bot').sendAlert(`CRITICAL: Reversal close succeeded but open failed for ${symbol}. Manual intervention required.`);
  }
}

module.exports = { checkReversal, executeReversal };
