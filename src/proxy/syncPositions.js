const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const POSITIONS_FILE = path.join(__dirname, '../state/positions.json');

let _connection = null;
let lastSyncTime = 0;
let _syncInterval = null;

function init(connection) {
  _connection = connection;
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

  const liveIds = new Set(
    (response.position || []).map(p => String(p.positionId))
  );

  let localPositions = [];
  try {
    localPositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
  } catch (err) {
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

module.exports = { init, syncPositions, startSync, getLastSyncTime };
