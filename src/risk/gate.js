const state = require('../state');
const { checkReversal, executeReversal } = require('./reversal');
const { getConnection } = require('../ctrader/orders');

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
  const lockKey = `${signal.symbol}:${signal.direction}`;
  if (state.executionLock.has(lockKey)) {
    log(`Signal rejected: ${signal.direction} ${signal.symbol} - execution in progress`);
    return;
  }
  state.executionLock.set(lockKey, Date.now());

  try {
    if (state.paused) {
      reject(signal, 'Trading is paused. Use /resume to enable.');
      return;
    }

    if (!state.settings.allowedSymbols.includes(signal.symbol)) {
      reject(signal, `Symbol ${signal.symbol} not in allowed list`);
      return;
    }

    const { isReversal, existingPosition } = checkReversal(signal);

    if (isReversal) {
      return await executeReversal(signal, existingPosition, getConnection());
    }

    if (state.positions.size >= state.settings.maxPositions) {
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
  } finally {
    state.executionLock.delete(lockKey);
  }
}

module.exports = { processSignal };
