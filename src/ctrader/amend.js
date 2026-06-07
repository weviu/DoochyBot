const { config } = require('../config');
const state = require('../state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function getContractSize(symbol) {
  return state.symbolMap.get(symbol)?.contractSize || 100000;
}

function dollarToPrice(dollarAmount, volume, symbol) {
  const contractSize = getContractSize(symbol);
  return dollarAmount / (volume * contractSize * 0.01);
}

function calcSLTP(positionId, symbol, entryPrice, direction, volume, signal) {
  const mode = state.settings.sltpMode || 'auto';
  const slUSD = state.settings.symbolStopLossUSD?.[symbol] ?? state.settings.stopLossUSD;
  const tpUSD = state.settings.symbolTakeProfitUSD?.[symbol] ?? state.settings.takeProfitUSD;

  let sl = null;
  let tp = null;

  if (mode === 'pivot') {
    sl = signal.sl ?? null;
    tp = signal.tp ?? null;
    log(`Pivot SL/TP: sl=${sl}, tp=${tp}`);
    return { sl, tp };
  }

  if (mode === 'auto') {
    sl = signal.sl ?? null;
    tp = signal.tp ?? null;
    if (sl !== null && tp !== null) {
      log(`Using signal SL/TP: sl=${sl}, tp=${tp}`);
      return { sl, tp };
    }
    // Fall through to dollar for any missing values
  }

  // Dollar mode (or auto fallback)
  const slDist = dollarToPrice(slUSD, volume, symbol);
  const tpDist = dollarToPrice(tpUSD, volume, symbol);

  if (direction === 'BUY') {
    if (sl === null) sl = entryPrice - slDist;
    if (tp === null) tp = entryPrice + tpDist;
  } else {
    if (sl === null) sl = entryPrice + slDist;
    if (tp === null) tp = entryPrice - tpDist;
  }

  log(`Dollar SL/TP: sl=${sl.toFixed(5)} ($${slUSD.toFixed(2)}), tp=${tp.toFixed(5)} ($${tpUSD.toFixed(2)})`);
  return { sl, tp };
}

function isSLValid(sl, entryPrice, direction) {
  if (direction === 'BUY') return sl < entryPrice;
  return sl > entryPrice;
}

function isTPValid(tp, entryPrice, direction) {
  if (direction === 'BUY') return tp > entryPrice;
  return tp < entryPrice;
}

async function sendAmendment(connection, positionId, sl, tp) {
  const payload = { ctidTraderAccountId: config.ctrader.accountId, positionId };
  if (sl !== null) payload.stopLoss = sl;
  if (tp !== null) payload.takeProfit = tp;
  await connection.sendCommand('ProtoOAAmendPositionSLTPReq', payload);
}

async function amendPositionSLTP(connection, positionId, symbol, entryPrice, direction, volume, signal) {
  if (!entryPrice) {
    log(`SL/TP skipped for position #${positionId}: entry price is missing`);
    return;
  }

  let { sl, tp } = calcSLTP(positionId, symbol, entryPrice, direction, volume, signal);

  if (sl !== null && !isSLValid(sl, entryPrice, direction)) {
    log(`SL/TP error for #${positionId}: SL ${sl} is on wrong side of entry ${entryPrice} for ${direction}, skipping SL`);
    sl = null;
  }
  if (tp !== null && !isTPValid(tp, entryPrice, direction)) {
    log(`SL/TP error for #${positionId}: TP ${tp} is on wrong side of entry ${entryPrice} for ${direction}, skipping TP`);
    tp = null;
  }

  const minHold = state.settings.minHoldSeconds ?? 60;

  // Set SL immediately
  try {
    await sendAmendment(connection, positionId, sl, minHold === 0 ? tp : null);
    const pos = state.positions.get(positionId);
    if (pos) {
      pos.sl = sl;
      if (minHold === 0) pos.tp = tp;
    }
    if (minHold > 0 && tp !== null) {
      log(`SL set immediately. TP will be set in ${minHold}s (min hold)`);
    } else {
      log(`SL/TP set: sl=${sl}, tp=${tp}`);
    }
  } catch (err) {
    log(`SL/TP amendment failed: ${err.message}`);
    return;
  }

  // Delay TP
  if (minHold > 0 && tp !== null) {
    setTimeout(async () => {
      if (!state.positions.has(positionId)) {
        log(`TP skipped - position #${positionId} already closed (reversal or manual close)`);
        return;
      }
      try {
        await sendAmendment(connection, positionId, null, tp);
        const pos = state.positions.get(positionId);
        if (pos) pos.tp = tp;
        log(`TP set after min hold: tp=${tp} (position #${positionId})`);
      } catch (err) {
        log(`TP amendment failed after min hold: ${err.message}`);
      }
    }, minHold * 1000);
  }
}

module.exports = { amendPositionSLTP };
