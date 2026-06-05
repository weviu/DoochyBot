const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { SYMBOL_LOT_SIZE } = require('../../utils/symbols');

const POSITIONS_FILE = path.join(__dirname, '../../state/positions.json');

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

      let localMap = new Map();
      try {
        const local = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
        localMap = new Map(local.map(p => [String(p.positionId), p]));
      } catch {}

      const positions = (response.position || []).map(pos => {
        const local = localMap.get(String(pos.positionId));
        const symbol = local?.symbol || null;
        const lotSize = symbol ? SYMBOL_LOT_SIZE[symbol] : null;
        const volumeUnits = pos.tradeData?.volume;
        const lots = lotSize && volumeUnits ? volumeUnits / lotSize : volumeUnits;

        return {
          positionId: pos.positionId,
          symbol,
          direction: pos.tradeData?.tradeSide,
          volume: lots,
          openPrice: pos.price,
          sl: pos.stopLoss || null,
          tp: pos.takeProfit || null,
          openTime: pos.tradeData?.openTimestamp
        };
      });

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
