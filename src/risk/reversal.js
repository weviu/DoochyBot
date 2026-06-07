const state = require('../state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
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

module.exports = { checkReversal };
