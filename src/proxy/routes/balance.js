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

      // Send ProtoOAAccountInfoReq to get balance info
      if (connection.connection.sendCommand && typeof connection.connection.sendCommand === 'function') {
        await connection.connection.sendCommand('ProtoOAAccountInfoReq', {
          accountId: connection.accountId
        });
      } else {
        await connection.connection.send({
          type: 'ProtoOAAccountInfoReq',
          accountId: connection.accountId
        });
      }

      // Wait for response with timeout
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Account info timeout'));
        }, 5000);

        const handler = (msg) => {
          if (msg.type === 'ProtoOAAccountInfoRes') {
            clearTimeout(timeout);
            connection.removeListener('message', handler);
            resolve(msg);
          }
        };

        connection.on('message', handler);
      });

      res.json({
        success: true,
        data: {
          equity: response.equity || 0,
          balance: response.balance || 0,
          margin: response.margin || 0,
          freeMargin: response.freeMargin || 0,
          marginLevel: response.marginLevel || 0
        }
      });
    } catch (err) {
      logger.error('Balance fetch error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
