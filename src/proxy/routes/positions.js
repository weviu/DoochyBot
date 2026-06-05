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

      const response = await connection.connection.sendCommand('ProtoOAReconcileReq', {
        ctidTraderAccountId: parseInt(connection.accountId)
      });

      const positions = (response.position || []).map(pos => ({
        positionId: pos.positionId,
        symbolId: pos.tradeData?.symbolId,
        direction: pos.tradeData?.tradeSide,
        volume: pos.tradeData?.volume,
        openPrice: pos.price,
        sl: pos.stopLoss,
        tp: pos.takeProfit,
        openTime: pos.tradeData?.openTimestamp
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
