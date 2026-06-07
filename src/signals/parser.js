const { resolveSymbol } = require('../config');

function parseSignal(rawAlert) {
  const direction = (rawAlert.direction || '').toLowerCase();
  if (direction !== 'buy' && direction !== 'sell') return null;

  const symbol = resolveSymbol(rawAlert.symbol || '');
  if (!symbol) return null;

  return {
    symbol,
    direction: direction.toUpperCase(),
    confidence: rawAlert.confidence,
    rsi: rawAlert.rsi,
    pivot_level: rawAlert.pivot_level,
    pivot_distance: rawAlert.pivot_distance,
    price: rawAlert.price,
    timeframe: rawAlert.timeframe,
    timestamp: rawAlert.timestamp,
  };
}

module.exports = { parseSignal };
