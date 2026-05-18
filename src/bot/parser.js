const logger = require('../utils/logger');

/**
 * Parse trading signal from user message
 * Format: "BUY BTCUSD SL=65000 TP=67000"
 * 
 * Returns: { direction, symbol, sl, tp, volume }
 * Throws: Error if parsing fails
 */
function parseSignal(message, symbolLotSizes) {
  const text = message.trim();
  
  // Parse direction (BUY, SELL, LONG, SHORT)
  const directionMatch = text.match(/^(BUY|SELL|LONG|SHORT)\s+/i);
  if (!directionMatch) {
    throw new Error('Invalid signal format. Start with BUY, SELL, LONG, or SHORT');
  }

  let direction = directionMatch[1].toUpperCase();
  // Normalize LONG -> BUY, SHORT -> SELL
  if (direction === 'LONG') direction = 'BUY';
  if (direction === 'SHORT') direction = 'SELL';

  // Extract symbol and rest of message
  const rest = text.substring(directionMatch[0].length).trim();
  
  // Symbol is everything before SL= or end of string
  const symbolMatch = rest.match(/^([A-Z0-9]+)\s*/i);
  if (!symbolMatch) {
    throw new Error('No symbol found. Format: BUY BTCUSD SL=65000 TP=67000');
  }

  const symbol = symbolMatch[1].toUpperCase();
  const remaining = rest.substring(symbolMatch[0].length).trim();

  // Parse SL (required)
  const slMatch = remaining.match(/SL\s*=\s*([\d.]+)/i);
  if (!slMatch) {
    throw new Error('Stop loss (SL) is required. Format: SL=65000');
  }
  const sl = parseFloat(slMatch[1]);

  // Parse TP (optional)
  const tpMatch = remaining.match(/TP\s*=\s*([\d.]+)/i);
  const tp = tpMatch ? parseFloat(tpMatch[1]) : null;

  // Get lot size from settings
  if (!symbolLotSizes[symbol]) {
    throw new Error(`Symbol ${symbol} not configured in settings`);
  }
  const volume = symbolLotSizes[symbol];

  logger.info('Signal parsed successfully', {
    direction,
    symbol,
    sl,
    tp,
    volume
  });

  return {
    direction,
    symbol,
    sl,
    tp,
    volume
  };
}

module.exports = {
  parseSignal
};
