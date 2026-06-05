const logger = require('../../utils/logger');
const holdTimer = require('../holdTimer');

module.exports = (connection) => {
  return async (req, res) => {
    try {
      if (!connection.isConnected || !connection.isAuthenticated) {
        return res.status(503).json({
          success: false,
          error: 'Not connected to cTrader'
        });
      }

      logger.info('Closing all positions');

      // Cancel all deferred TP timers before closing
      holdTimer.cancelAll();

      // First get all positions
      if (connection.connection.sendCommand && typeof connection.connection.sendCommand === 'function') {
        await connection.connection.sendCommand('ProtoOAPositionListReq', {
          accountId: connection.accountId
        });
      } else {
        await connection.connection.send({
          type: 'ProtoOAPositionListReq',
          accountId: connection.accountId
        });
      }

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Position list timeout'));
        }, 5000);

        const handler = (msg) => {
          if (msg.type === 'ProtoOAPositionListRes') {
            clearTimeout(timeout);
            connection.removeListener('message', handler);
            resolve(msg);
          }
        };

        connection.on('message', handler);
      });

      const positions = response.positions || [];
      let closedCount = 0;
      let failedCount = 0;
      const failures = [];

      // Close each position sequentially
      for (const pos of positions) {
        try {
          if (connection.connection.sendCommand && typeof connection.connection.sendCommand === 'function') {
            await connection.connection.sendCommand('ProtoOAClosePositionReq', {
              accountId: connection.accountId,
              positionId: pos.positionId
            });
          } else {
            await connection.connection.send({
              type: 'ProtoOAClosePositionReq',
              accountId: connection.accountId,
              positionId: pos.positionId
            });
          }

          // Wait for close response
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Close timeout'));
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

          closedCount++;
          logger.info('Position closed', { positionId: pos.positionId });
        } catch (err) {
          failedCount++;
          failures.push(pos.positionId);
          logger.warn('Failed to close position', {
            positionId: pos.positionId,
            error: err.message
          });
        }
      }

      logger.info('Close all completed', { closedCount, failedCount });

      res.json({
        success: failedCount === 0,
        data: {
          closedCount,
          failedCount,
          failures
        }
      });
    } catch (err) {
      logger.error('Close all error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
