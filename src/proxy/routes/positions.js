const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { SYMBOL_LOT_SIZE, SYMBOL_PRICE_DECIMALS, COMMON_SYMBOLS } = require('../../utils/symbols');
const { getRawPrice } = require('../priceCache');

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
        const contractSize = volumeUnits ? volumeUnits * 0.01 : 0;

        // Current price from spot subscription (raw pipettes → actual price)
        let pnl = null;
        const symbolId = COMMON_SYMBOLS[symbol];
        if (symbolId && contractSize > 0 && pos.price != null) {
          const priceData = getRawPrice(symbolId);
          if (priceData) {
            const digits = SYMBOL_PRICE_DECIMALS[symbol] ?? 5;
            const scale = Math.pow(10, digits);
            const isBuy = pos.tradeData?.tradeSide === 'BUY' || pos.tradeData?.tradeSide === 1;
            // Close BUY at bid, close SELL at ask
            const rawClose = isBuy ? priceData.bid : priceData.ask;
            if (rawClose != null) {
              const closePrice = rawClose / scale;
              const direction = isBuy ? 1 : -1;
              pnl = parseFloat((direction * (closePrice - pos.price) * contractSize).toFixed(2));
            }
          }
        }

        return {
          positionId: pos.positionId,
          symbol,
          direction: pos.tradeData?.tradeSide,
          volume: lots,
          openPrice: pos.price,
          sl: pos.stopLoss || null,
          tp: pos.takeProfit || null,
          pnl,
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
