const { SYMBOL_LOT_SIZE, SYMBOL_PRICE_DECIMALS } = require('../utils/symbols');

// Fallback decimal places when symbol not in SYMBOL_PRICE_DECIMALS
function _priceDecimals(price) {
  if (price > 10000) return 1;
  if (price > 1000)  return 2;
  if (price > 100)   return 2;
  if (price > 1)     return 4;
  return 6;
}

/**
 * Dollar-based SL/TP: derive price distances from fixed $ amounts.
 * Requires actual entry price (call after order fill).
 * Returns { sl, tp, method: 'dollar', slDollars, tpDollars }
 */
function calculateDollar(entryPrice, direction, volume, symbol, settings) {
  const lotSize = SYMBOL_LOT_SIZE[symbol];
  if (!lotSize || !entryPrice || !volume) return { sl: null, tp: null, method: 'dollar' };

  const volumeUnits = Math.round(volume * lotSize);
  const contractSize = volumeUnits * 0.01;
  if (contractSize <= 0) return { sl: null, tp: null, method: 'dollar' };

  const decimals = SYMBOL_PRICE_DECIMALS[symbol] ?? _priceDecimals(entryPrice);
  const isBuy = direction === 'BUY';
  let sl = null, tp = null;

  if (settings.stopLossUSD) {
    const delta = settings.stopLossUSD / contractSize;
    sl = parseFloat((isBuy ? entryPrice - delta : entryPrice + delta).toFixed(decimals));
  }
  if (settings.takeProfitUSD) {
    const delta = settings.takeProfitUSD / contractSize;
    tp = parseFloat((isBuy ? entryPrice + delta : entryPrice - delta).toFixed(decimals));
  }

  return { sl, tp, method: 'dollar', slDollars: settings.stopLossUSD ?? null, tpDollars: settings.takeProfitUSD ?? null };
}

/**
 * Pivot-based SL/TP: anchor to nearest pivot level with a percentage buffer.
 * pivotData: { PP, R1, R2, R3, S1, S2, S3 } — any subset is valid.
 * Returns { sl, tp, method: 'pivot', slLevel, tpLevel } or null if insufficient data.
 */
function calculatePivot(entryPrice, direction, symbol, pivotData, settings) {
  if (!pivotData || !entryPrice) return null;

  const decimals = SYMBOL_PRICE_DECIMALS[symbol] ?? _priceDecimals(entryPrice);
  const slBuf = (settings.sl_buffer_percent ?? 0.25) / 100;
  const tpBuf = (settings.tp_buffer_percent ?? 0.15) / 100;

  const NAMES = ['S3', 'S2', 'S1', 'PP', 'R1', 'R2', 'R3'];
  const levels = NAMES
    .filter(n => pivotData[n] != null)
    .map(n => ({ name: n, price: pivotData[n] }))
    .sort((a, b) => a.price - b.price);

  if (levels.length < 2) return null;

  let sl = null, tp = null, slLevel = null, tpLevel = null;

  if (direction === 'BUY') {
    const below = [...levels].reverse().find(l => l.price <= entryPrice);
    const above = levels.find(l => l.price > entryPrice);
    if (below) { sl = parseFloat((below.price * (1 - slBuf)).toFixed(decimals)); slLevel = below.name; }
    if (above) { tp = parseFloat((above.price * (1 - tpBuf)).toFixed(decimals)); tpLevel = above.name; }
  } else {
    const above = levels.find(l => l.price >= entryPrice);
    const below = [...levels].reverse().find(l => l.price < entryPrice);
    if (above) { sl = parseFloat((above.price * (1 + slBuf)).toFixed(decimals)); slLevel = above.name; }
    if (below) { tp = parseFloat((below.price * (1 + tpBuf)).toFixed(decimals)); tpLevel = below.name; }
  }

  if (sl == null && tp == null) return null;
  return { sl, tp, method: 'pivot', slLevel, tpLevel };
}

/**
 * Main entry point. Picks calculation method based on settings.tpsl_mode and available pivot data.
 * signal: { symbol, direction, price (entry), volume }
 * pivotData: optional { PP, R1, ... }
 */
function calculateSLTP(signal, settings, pivotData = null) {
  const mode = settings.tpsl_mode ?? 'auto';
  const hasPivot = pivotData && Object.values(pivotData).some(v => v != null);
  const usePivot = mode === 'pivot' || (mode === 'auto' && hasPivot);

  if (usePivot) {
    const result = calculatePivot(
      signal.price ?? signal.entryPrice,
      signal.direction, signal.symbol, pivotData, settings
    );
    if (result) return result;
    // Fall through to dollar if pivot produced nothing
  }

  return calculateDollar(
    signal.price ?? signal.entryPrice,
    signal.direction, signal.volume, signal.symbol, settings
  );
}

module.exports = { calculateSLTP, calculateDollar, calculatePivot };
