const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { SYMBOL_LOT_SIZE, SYMBOL_PRICE_DECIMALS } = require('../utils/symbols');
const { amendPositionSLTP } = require('./amendPosition');
const holdTimer = require('./holdTimer');

const POSITIONS_FILE = path.join(__dirname, '../state/positions.json');
const SETTINGS_FILE = path.join(__dirname, '../state/settings.json');

let _connection = null;
let lastSyncTime = 0;
let _syncInterval = null;

function init(connection) {
  _connection = connection;
}

function _loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

/**
 * Apply dollar-based TP/SL to any live positions that are missing them.
 * livePositions: array from ProtoOAReconcileReq response.position
 * localPositions: current contents of positions.json (already synced)
 * Returns { applied, skipped, results }
 */
async function _applyDollarTargets(livePositions, localPositions) {
  const settings = _loadSettings();
  const localMap = new Map(localPositions.map(p => [String(p.positionId), p]));

  let applied = 0, skipped = 0;
  const results = [];

  for (const pos of livePositions) {
    const local = localMap.get(String(pos.positionId));
    if (!local) { skipped++; continue; }

    const tpAmount = settings.symbolTakeProfitUSD?.[local.symbol] ?? settings.takeProfitUSD;
    const slAmount = settings.symbolStopLossUSD?.[local.symbol] ?? settings.stopLossUSD;

    const needsTP = tpAmount && !(pos.takeProfit > 0) && !holdTimer.hasPending(String(pos.positionId));
    const needsSL = slAmount && !(pos.stopLoss > 0);

    if (!needsTP && !needsSL) { skipped++; continue; }

    const lotSize = SYMBOL_LOT_SIZE[local.symbol];
    if (!lotSize) {
      logger.warn('applyDollarTargets: unknown symbol', { symbol: local.symbol });
      skipped++;
      continue;
    }

    const entryPrice = pos.price || local.entryPrice;
    if (!entryPrice) { skipped++; continue; }

    const direction = local.direction ||
      (pos.tradeData?.tradeSide === 'SELL' || pos.tradeData?.tradeSide === 2 ? 'SELL' : 'BUY');

    const volumeInCTraderUnits = parseInt(pos.tradeData?.volume) || 0;
    const contractSize = volumeInCTraderUnits * 0.01;
    if (contractSize <= 0) { skipped++; continue; }

    let newTP = null, newSL = null;
    const priceDecimals = SYMBOL_PRICE_DECIMALS[local.symbol] ?? 5;

    if (needsTP) {
      const delta = tpAmount / contractSize;
      newTP = parseFloat((direction === 'BUY' ? entryPrice + delta : entryPrice - delta).toFixed(priceDecimals));
    }
    if (needsSL) {
      const delta = slAmount / contractSize;
      newSL = parseFloat((direction === 'BUY' ? entryPrice - delta : entryPrice + delta).toFixed(priceDecimals));
    }

    // Preserve any existing SL/TP that we are not overwriting.
    // Omitting a field from ProtoOAAmendPositionSLTPReq sends 0, which clears it on cTrader.
    const finalSL = newSL !== null ? newSL : (pos.stopLoss > 0 ? pos.stopLoss : null);
    const finalTP = newTP !== null ? newTP : (pos.takeProfit > 0 ? pos.takeProfit : null);

    const result = await amendPositionSLTP(_connection, pos.positionId, local.symbol, finalSL, finalTP);

    if (result.success) {
      applied++;
      logger.info('Dollar-based SL/TP applied', {
        positionId: pos.positionId, symbol: local.symbol, direction, newTP: finalTP, newSL: finalSL
      });
      results.push({ positionId: pos.positionId, symbol: local.symbol, direction, newTP: finalTP, newSL: finalSL, success: true });
    } else {
      skipped++;
      logger.warn('Failed to apply dollar-based SL/TP', {
        positionId: pos.positionId, symbol: local.symbol, error: result.error
      });
      results.push({ positionId: pos.positionId, symbol: local.symbol, success: false, error: result.error });
    }
  }

  if (applied > 0) {
    logger.info('Dollar target pass complete', { applied, skipped });
  }

  return { applied, skipped, results };
}

/**
 * Public: fetch live positions from cTrader, apply dollar targets to any missing TP/SL.
 * Used by /risk apply command.
 */
async function applyDollarTargets() {
  if (!_connection || !_connection.isConnected || !_connection.isAuthenticated) {
    throw new Error('Not connected to cTrader');
  }

  const response = await _connection.connection.sendCommand('ProtoOAReconcileReq', {
    ctidTraderAccountId: parseInt(_connection.accountId)
  });

  const livePositions = response.position || [];

  let localPositions = [];
  try {
    localPositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
  } catch {}

  return _applyDollarTargets(livePositions, localPositions);
}

/**
 * Fetch live positions from cTrader and remove any stale entries from positions.json.
 * Local metadata (symbol name, entry price, etc.) is preserved for positions still open.
 * cTrader is the source of truth — positions not present on cTrader are removed.
 */
async function syncPositions() {
  if (!_connection || !_connection.isConnected || !_connection.isAuthenticated) {
    logger.warn('Position sync skipped — not connected to cTrader');
    return;
  }

  const response = await _connection.connection.sendCommand('ProtoOAReconcileReq', {
    ctidTraderAccountId: parseInt(_connection.accountId)
  });

  const livePositions = response.position || [];
  const liveIds = new Set(livePositions.map(p => String(p.positionId)));

  let localPositions = [];
  try {
    localPositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
  } catch {
    // File missing or corrupt — start fresh
  }

  const synced = localPositions.filter(p => liveIds.has(String(p.positionId)));
  const removed = localPositions.length - synced.length;

  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(synced, null, 2));
  lastSyncTime = Date.now();

  if (removed > 0) {
    logger.info('Position sync: removed stale entries', {
      live: liveIds.size,
      kept: synced.length,
      removed
    });
  } else {
    logger.info('Position sync complete', { live: liveIds.size, local: synced.length });
  }

  // Apply dollar-based TP/SL to any open positions that are missing them
  if (livePositions.length > 0) {
    await _applyDollarTargets(livePositions, synced).catch(err =>
      logger.warn('Dollar target application failed during sync', { error: err.message })
    );
  }
}

function startSync(intervalMs = 30000) {
  if (_syncInterval) clearInterval(_syncInterval);

  // Immediate sync on startup
  syncPositions().catch(err =>
    logger.warn('Initial position sync failed', { error: err.message })
  );

  _syncInterval = setInterval(() => {
    syncPositions().catch(err =>
      logger.warn('Periodic position sync failed', { error: err.message })
    );
  }, intervalMs);

  logger.info(`Position sync started (every ${intervalMs / 1000}s)`);
}

function getLastSyncTime() {
  return lastSyncTime;
}

module.exports = { init, syncPositions, startSync, getLastSyncTime, applyDollarTargets };
