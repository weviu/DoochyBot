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

      const response = await connection.connection.sendCommand('ProtoOATraderReq', {
        ctidTraderAccountId: parseInt(connection.accountId)
      });

      const trader = response.trader || {};
      // balance is stored as integer; moneyDigits gives the exponent (divide by 10^moneyDigits)
      const divisor = Math.pow(10, trader.moneyDigits || 2);

      res.json({
        success: true,
        data: {
          balance: (trader.balance || 0) / divisor,
          leverage: trader.leverageInCents ? trader.leverageInCents / 100 : null,
          currency: trader.depositAssetId || null
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
