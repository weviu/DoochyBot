const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const TRADE_LOG_FILE = path.join(__dirname, '../../state/tradeLog.json');

function loadTradeLog() {
  try {
    if (fs.existsSync(TRADE_LOG_FILE)) {
      const data = fs.readFileSync(TRADE_LOG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.error('Failed to load trade log', { error: err.message });
  }
  return [];
}

function saveTradeLog(trades) {
  try {
    const dir = path.dirname(TRADE_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TRADE_LOG_FILE, JSON.stringify(trades, null, 2));
  } catch (err) {
    logger.error('Failed to save trade log', { error: err.message });
  }
}

module.exports = (connection) => {
  return async (req, res) => {
    try {
      if (!connection.isConnected || !connection.isAuthenticated) {
        return res.status(503).json({
          success: false,
          error: 'Not connected to cTrader'
        });
      }

      const { symbol, direction, volume, sl, tp } = req.body;

      // Validate required fields
      if (!symbol || !direction || volume === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: symbol, direction, volume'
        });
      }

      if (!['BUY', 'SELL'].includes(direction.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: 'Direction must be BUY or SELL'
        });
      }

      logger.info('Executing trade', { symbol, direction, volume, sl, tp });

      // Send ProtoOAOrderReq
      if (connection.connection.sendCommand && typeof connection.connection.sendCommand === 'function') {
        await connection.connection.sendCommand('ProtoOAOrderReq', {
          accountId: connection.accountId,
          symbol: symbol,
          direction: direction.toUpperCase(),
          volume: volume,
          orderType: 'MARKET',
          stopLoss: sl,
          takeProfit: tp
        });
      } else {
        await connection.connection.send({
          type: 'ProtoOAOrderReq',
          accountId: connection.accountId,
          symbol: symbol,
          direction: direction.toUpperCase(),
          volume: volume,
          orderType: 'MARKET',
          stopLoss: sl,
          takeProfit: tp
        });
      }

      // Wait for order response
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Order execution timeout'));
        }, 5000);

        const handler = (msg) => {
          if (msg.type === 'ProtoOAOrderRes') {
            clearTimeout(timeout);
            connection.removeListener('message', handler);
            resolve(msg);
          }
        };

        connection.on('message', handler);
      });

      // Log the trade
      const tradeLog = loadTradeLog();
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').split('.')[0];

      tradeLog.push({
        symbol,
        direction: direction.toUpperCase(),
        volume,
        sl,
        tp,
        orderId: response.orderId,
        positionId: response.positionId,
        entryPrice: response.executionPrice,
        openTime: timestamp,
        status: 'open'
      });

      saveTradeLog(tradeLog);
      logger.info('Trade executed and logged', {
        orderId: response.orderId,
        positionId: response.positionId
      });

      res.json({
        success: true,
        data: {
          orderId: response.orderId,
          positionId: response.positionId,
          executionPrice: response.executionPrice
        }
      });
    } catch (err) {
      logger.error('Trade execution error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
