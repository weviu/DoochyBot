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

      // Send ProtoOAPositionListReq
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

      // Wait for response
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

      const positions = (response.positions || []).map(pos => ({
        positionId: pos.positionId,
        symbol: pos.symbol,
        direction: pos.direction, // BUY or SELL
        volume: pos.volume,
        openPrice: pos.openPrice,
        currentPrice: pos.currentPrice,
        sl: pos.stopLoss,
        tp: pos.takeProfit,
        pnl: pos.pnl,
        openTime: pos.openTime
      }));

      res.json({
        success: true,
        data: positions
      });
    } catch (err) {
      logger.error('Positions fetch error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
