const { config } = require('../config');
const state = require('../state');
const { appendTrade } = require('../storage');
const { amendPositionSLTP } = require('./amend');

let _connection = null;

function setConnection(conn) {
  _connection = conn;
}

function getConnection() {
  return _connection;
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function calcVolume(signal) {
  const lotSize = state.settings.lotSizes[signal.symbol] || 0.01;

  if (state.settings.riskMode !== 'percent') {
    return Math.max(0.01, Math.floor(lotSize * 100) / 100);
  }

  if (!signal.sl) {
    log(`Warning: riskMode is percent but no SL on signal for ${signal.symbol}, falling back to fixed lot size`);
    return Math.max(0.01, Math.floor(lotSize * 100) / 100);
  }

  const slDistance = Math.abs(signal.price - signal.sl);
  if (slDistance <= 0) {
    log(`Warning: SL distance is zero for ${signal.symbol}, falling back to fixed lot size`);
    return Math.max(0.01, Math.floor(lotSize * 100) / 100);
  }

  const riskAmount = state.accountInfo.equity * (state.settings.riskPercent / 100);
  const contractSize = state.symbolMap.get(signal.symbol)?.contractSize || 100000;
  const volume = riskAmount / (slDistance * contractSize * 0.01);
  return Math.max(0.01, Math.floor(volume * 100) / 100);
}

async function executeSignal(signal) {
  const symbolInfo = state.symbolMap.get(signal.symbol);
  if (!symbolInfo) {
    log(`Order rejected: Symbol ID not found for ${signal.symbol}`);
    return;
  }

  const volume = calcVolume(signal);
  const ctraderVolume = Math.round(volume * 100000);
  const clientOrderId = `doochy_${Date.now()}`;

  const fillPromise = new Promise((resolve, reject) => {
    let listenerUuid;
    const timeout = setTimeout(() => {
      _connection.removeEventListener(listenerUuid);
      reject(new Error(`Order fill timeout - order may still execute, check positions`));
    }, 30000);

    listenerUuid = _connection.on('ProtoOAExecutionEvent', (msg) => {
      if (
        msg.executionType === 'ORDER_FILLED' &&
        msg.deal?.clientOrderId === clientOrderId
      ) {
        clearTimeout(timeout);
        _connection.removeEventListener(listenerUuid);
        resolve(msg);
      }
    });
  });

  _connection.sendCommand('ProtoOANewOrderReq', {
    ctidTraderAccountId: config.ctrader.accountId,
    symbolId: symbolInfo.symbolId,
    orderType: 'MARKET',
    tradeSide: signal.direction,
    volume: ctraderVolume,
    timeInForce: 'IMMEDIATE_OR_CANCEL',
    clientOrderId,
  });

  let fillEvent;
  try {
    fillEvent = await fillPromise;
  } catch (err) {
    log(`Warning: ${err.message}`);
    return;
  }

  const positionId = fillEvent.position?.positionId;
  const openPrice = fillEvent.deal?.executionPrice;

  log(`Order filled: ${signal.direction} ${volume} ${signal.symbol} @ ${openPrice} | Position #${positionId}`);
  require('../bot/bot').sendAlert(`${signal.direction} ${volume} ${signal.symbol} filled @ ${openPrice} | Position #${positionId}`);

  state.positions.set(positionId, {
    symbol: signal.symbol,
    direction: signal.direction,
    volume,
    entryPrice: openPrice,
    sl: null,
    tp: null,
    openTime: Date.now(),
    confidence: signal.confidence || null,
  });

  // Not awaited - SL is set immediately, TP after minHoldSeconds timer
  amendPositionSLTP(_connection, positionId, signal.symbol, openPrice, signal.direction, volume, signal);

  appendTrade({
    timestamp: new Date().toISOString(),
    symbol: signal.symbol,
    direction: signal.direction,
    volume,
    entryPrice: openPrice,
    exitPrice: null,
    pnl: null,
    positionId,
    orderId: fillEvent.deal?.orderId || null,
    sl: signal.sl || null,
    tp: signal.tp || null,
    holdTime: null,
    source: 'signal',
  });
}

module.exports = { executeSignal, setConnection, getConnection };
