const logger = require('../utils/logger');
const { amendPositionSLTP } = require('./amendPosition');

// positionId (string) → { timeoutId, tp, symbol }
const _pending = new Map();

/**
 * Schedule a deferred TP amendment for a position.
 * SL should already be set; this fires after delayMs to set TP.
 */
function schedule(connection, positionId, symbol, tp, delayMs) {
  cancel(positionId); // clear any existing timer for this position

  const id = String(positionId);
  const timeoutId = setTimeout(async () => {
    _pending.delete(id);
    logger.info('Hold timer elapsed — setting deferred TP', { positionId, symbol, tp });
    try {
      const result = await amendPositionSLTP(connection, positionId, symbol, null, tp);
      if (result.success) {
        logger.info('Deferred TP set successfully', { positionId, tp });
      } else {
        logger.warn('Deferred TP amendment failed', { positionId, error: result.error });
      }
    } catch (err) {
      logger.warn('Deferred TP amendment threw', { positionId, error: err.message });
    }
  }, delayMs);

  _pending.set(id, { timeoutId, tp, symbol });
  logger.info(`Hold timer started — TP ${tp} will be set in ${(delayMs / 1000).toFixed(0)}s`, { positionId, symbol });
}

/**
 * Cancel a pending deferred TP (call on manual close to prevent orphaned timers).
 */
function cancel(positionId) {
  const entry = _pending.get(String(positionId));
  if (entry) {
    clearTimeout(entry.timeoutId);
    _pending.delete(String(positionId));
    logger.info('Hold timer cancelled', { positionId });
  }
}

/**
 * Cancel all pending timers (call before closeall).
 */
function cancelAll() {
  for (const [id, { timeoutId }] of _pending) {
    clearTimeout(timeoutId);
    logger.info('Hold timer cancelled (closeall)', { positionId: id });
  }
  _pending.clear();
}

/**
 * Returns true if a deferred TP timer is pending for this position.
 * Used by _applyDollarTargets to avoid setting TP prematurely during sync.
 */
function hasPending(positionId) {
  return _pending.has(String(positionId));
}

module.exports = { schedule, cancel, cancelAll, hasPending };
