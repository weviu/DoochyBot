const logger = require('../../utils/logger');

module.exports = (connection) => {
  return async (req, res) => {
    try {
      if (!connection.isConnected || !connection.isAuthenticated) {
        return res.status(503).json({
          success: false,
          error: 'Not connected to cTrader'
        });
      }

      const { positionId } = req.params;

      if (!positionId) {
        return res.status(400).json({
          success: false,
          error: 'Position ID required'
        });
      }

      logger.info('Closing position', { positionId });

      // Send ProtoOAClosePositionReq
      if (connection.connection.sendCommand && typeof connection.connection.sendCommand === 'function') {
        await connection.connection.sendCommand('ProtoOAClosePositionReq', {
          accountId: connection.accountId,
          positionId: positionId
        });
      } else {
        await connection.connection.send({
          type: 'ProtoOAClosePositionReq',
          accountId: connection.accountId,
          positionId: positionId
        });
      }

      // Wait for response
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Position close timeout'));
        }, 5000);

        const handler = (msg) => {
          if (msg.type === 'ProtoOAClosePositionRes') {
            clearTimeout(timeout);
            connection.removeListener('message', handler);
            resolve(msg);
          }
        };

        connection.on('message', handler);
      });

      logger.info('Position closed', { positionId });

      res.json({
        success: true,
        data: {
          positionId: positionId,
          closedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      logger.error('Position close error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
