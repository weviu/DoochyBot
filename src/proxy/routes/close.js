const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const holdTimer = require('../holdTimer');

const POSITIONS_FILE = path.join(__dirname, '../../state/positions.json');

function removeFromPositions(positionId) {
  try {
    const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
    const updated = positions.filter(p => String(p.positionId) !== String(positionId));
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(updated, null, 2));
  } catch (err) {
    logger.error('Failed to remove position from local state', { positionId, error: err.message });
  }
}

module.exports = (connection) => {
  return async (req, res) => {
    try {
      if (!connection.isConnected || !connection.isAuthenticated) {
        return res.status(503).json({ success: false, error: 'Not connected to cTrader' });
      }

      const { positionId } = req.params;
      if (!positionId) {
        return res.status(400).json({ success: false, error: 'Position ID required' });
      }

      // Reconcile to get the current position and its volume in cTrader units
      const reconcileRes = await connection.connection.sendCommand('ProtoOAReconcileReq', {
        ctidTraderAccountId: parseInt(connection.accountId)
      });

      const livePosition = (reconcileRes.position || []).find(
        p => String(p.positionId) === String(positionId)
      );

      if (!livePosition) {
        return res.status(404).json({ success: false, error: `Position ${positionId} not found` });
      }

      const volume = parseInt(livePosition.tradeData.volume);

      logger.info('Closing position', { positionId, volume });

      // Cancel any deferred TP timer before closing
      holdTimer.cancel(positionId);

      // ProtoOAClosePositionReq has no matching Res — sendCommand resolves immediately after send
      await connection.connection.sendCommand('ProtoOAClosePositionReq', {
        ctidTraderAccountId: parseInt(connection.accountId),
        positionId: parseInt(positionId),
        volume
      });

      logger.info('Close command sent', { positionId });

      // Remove from local positions cache so risk gate reflects the close
      removeFromPositions(positionId);

      res.json({
        success: true,
        data: { positionId, closedAt: new Date().toISOString() }
      });
    } catch (err) {
      logger.error('Position close error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  };
};
