const state = require('../state');
const { checkReversal } = require('./reversal');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function reject(signal, reason) {
  log(`Signal rejected: ${signal.direction} ${signal.symbol} - ${reason}`);
}

async function processSignal(signal) {
  if (state.paused) {
    reject(signal, 'Trading is paused. Use /resume to enable.');
    return;
  }

  if (!state.settings.allowedSymbols.includes(signal.symbol)) {
    reject(signal, `Symbol ${signal.symbol} not in allowed list`);
    return;
  }

  const { isReversal } = checkReversal(signal);

  if (!isReversal && state.positions.size >= state.settings.maxPositions) {
    reject(signal, `Max positions reached (${state.positions.size}/${state.settings.maxPositions})`);
    return;
  }

  if (state.tradingLocked) {
    reject(signal, 'Trading locked - daily loss limit reached');
    return;
  }

  const key = `${signal.symbol}:${signal.direction}`;
  const lastTime = state.lastSignalTime.get(key);
  if (lastTime && Date.now() - lastTime < 60000) {
    reject(signal, 'Duplicate signal - same symbol/direction within 60s');
    return;
  }
  state.lastSignalTime.set(key, Date.now());

  log(`Signal passed: ${signal.direction} ${signal.symbol}`);
  const { executeSignal } = require('../ctrader/orders');
  await executeSignal(signal);
}

module.exports = { processSignal };
