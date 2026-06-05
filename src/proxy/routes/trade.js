const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { amendPositionSLTP } = require('../amendPosition');
const { loadSettings } = require('../../bot/riskGate');
const { SYMBOL_LOT_SIZE, SYMBOL_PRICE_DECIMALS } = require('../../utils/symbols');

const TRADE_LOG_FILE = path.join(__dirname, '../../state/tradeLog.json');

// Symbol IDs and lot sizes verified against live account 47483124 (FTMO Platform Live 17124220)
// via ProtoOASymbolsListReq + ProtoOASymbolByIdReq. lotSize = exact protocol multiplier per lot.
// Protocol volume = user_lots * lotSize. Run lookup-symbols.js when switching accounts.
const COMMON_SYMBOLS = {
  // Forex
  'EURUSD':      1, 'GBPUSD':      2, 'USDJPY':      4, 'AUDUSD':      5,
  'USDCHF':      6, 'USDCAD':      8, 'NZDUSD':     12,
  // Metals
  'XAUUSD':     41, 'GOLD':        41, 'XAGUSD':     42,
  'XPDUSD':     95, 'XPTUSD':     97, 'XCUUSD':    325,
  // Indices & Commodities
  'USOIL':     273, 'OIL':        273, 'US500.cash': 270, 'US100.cash': 275,
  'US30.cash': 283,
  // Crypto
  'ETHUSD':    323, 'BTCUSD':    324, 'ADAUSD':    316, 'DOGEUSD':   317,
  'XRPUSD':   318, 'NEOUSD':    319, 'DASHUSD':   320, 'XMRUSD':    321,
  'LTCUSD':   322, 'DOTUSD':    335, 'AAVUSD':    284, 'XLMUSD':    291,
  'GALUSD':   292, 'NERUSD':    294, 'LNKUSD':    295, 'AVAUSD':    296,
  'SOLUSD':   297, 'BNBUSD':    298, 'BARUSD':    299, 'XTZUSD':    300,
  'SANUSD':   302, 'BCHUSD':    303, 'ETCUSD':    304, 'UNIUSD':    305,
  'ALGUSD':   306, 'VECUSD':    307, 'MANUSD':    309, 'IMXUSD':    310,
  'GRTUSD':   311, 'ICPUSD':    312, 'FETUSD':    336,
};


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

      const { symbol, direction, volume, sl, tp, meta } = req.body;

      // Validate required fields
      if (!symbol || !direction || volume === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: symbol, direction, volume'
        });
      }

      const directionUpper = direction.toUpperCase();
      if (!['BUY', 'SELL'].includes(directionUpper)) {
        return res.status(400).json({
          success: false,
          error: 'Direction must be BUY or SELL'
        });
      }

      logger.info('Executing trade', { symbol, direction: directionUpper, volume, sl, tp });

      // Look up symbolId from known symbols mapping
      const symbolId = COMMON_SYMBOLS[symbol];
      if (!symbolId) {
        return res.status(400).json({
          success: false,
          error: `Symbol "${symbol}" not supported. Supported symbols: ${Object.keys(COMMON_SYMBOLS).join(', ')}`
        });
      }

      logger.info('Found symbolId', { symbol, symbolId });

      // Protocol volume = user_lots * lotSize (per-symbol, queried from ProtoOASymbolByIdReq).
      // Each symbol has a different contract size; using a flat multiplier causes wrong volumes.
      const lotSize = SYMBOL_LOT_SIZE[symbol];
      if (!lotSize) {
        return res.status(400).json({
          success: false,
          error: `No lot size configured for symbol "${symbol}". Add it to SYMBOL_LOT_SIZE.`
        });
      }
      const volumeInCTraderUnits = Math.round(volume * lotSize);

      logger.info('Volume conversion', {
        userVolume: volume,
        lotSize,
        ctraderUnits: volumeInCTraderUnits
      });

      // Build the ProtoOANewOrderReq payload
      // Note: For MARKET orders, absolute SL/TP are not supported
      // They only work for LIMIT, STOP, STOP_LIMIT orders
      const orderPayload = {
        ctidTraderAccountId: parseInt(connection.accountId),
        symbolId: parseInt(symbolId),
        orderType: 'MARKET',  // Can be MARKET, LIMIT, STOP, MARKET_RANGE, STOP_LIMIT
        tradeSide: directionUpper,  // BUY or SELL
        volume: volumeInCTraderUnits,
        timeInForce: 'IMMEDIATE_OR_CANCEL'  // For MARKET orders, use IOC
        // Note: stopLoss and takeProfit cannot be set for MARKET orders
        // They must be set via a separate position management command (ProtoOAAmendPositionSLTPReq)
      };

      logger.info('ProtoOANewOrderReq payload', { payload: JSON.stringify(orderPayload) });

      // ProtoOANewOrderReq doesn't have a matching Res — response comes as ProtoOAExecutionEvent or ProtoOAOrderErrorEvent
      // Register listeners BEFORE sending the command (events can arrive before async returns)
      let responseEvent = null;
      let timeout = null;

      const responsePromise = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          logger.warn('Trade timeout - no execution/error event received within 30 seconds');
          reject(new Error('Trade execution timeout - no response within 30 seconds'));
        }, 30000);

        // Listen for execution events on the connection object
        const onExecutionEvent = (event) => {
          // Check if this is for our account (compare as strings)
          const accountMatches = String(event.ctidTraderAccountId) === String(connection.accountId);
          
          if (accountMatches) {
            logger.info('ProtoOAExecutionEvent received', {
              executionType: event.executionType,
              positionId: event.position?.positionId,
              price: event.position?.price
            });
            
            // Wait specifically for ORDER_FILLED to have the execution price
            if (event.executionType === 'ORDER_FILLED') {
              responseEvent = event;
              clearTimeout(timeout);
              connection.removeListener('ProtoOAExecutionEvent', onExecutionEvent);
              connection.removeListener('ProtoOAOrderErrorEvent', onOrderErrorEvent);
              resolve(event);
            }
            // For MARKET orders, ORDER_ACCEPTED might be enough, but we prefer ORDER_FILLED for the price
          }
        };

        // Listen for order error events
        const onOrderErrorEvent = (event) => {
          logger.info('ProtoOAOrderErrorEvent received', {
            ctidTraderAccountId: event.ctidTraderAccountId,
            errorCode: event.errorCode,
            accountMatch: event.ctidTraderAccountId === String(connection.accountId)
          });

          // Check if this is for our account (compare as strings)
          const accountMatches = String(event.ctidTraderAccountId) === String(connection.accountId);
          
          if (accountMatches) {
            responseEvent = event;
            clearTimeout(timeout);
            connection.removeListener('ProtoOAExecutionEvent', onExecutionEvent);
            connection.removeListener('ProtoOAOrderErrorEvent', onOrderErrorEvent);
            const desc = event.description ? ` — ${event.description}` : '';
            reject(new Error(`Order error: ${event.errorCode || 'Unknown error code'}${desc}`));
          }
        };

        connection.on('ProtoOAExecutionEvent', onExecutionEvent);
        connection.on('ProtoOAOrderErrorEvent', onOrderErrorEvent);
      });

      // Send ProtoOANewOrderReq
      try {
        logger.info('Sending ProtoOANewOrderReq (exact payload): ' + util.inspect(orderPayload, { showHidden: false, depth: null }));
        const sendResult = await connection.connection.sendCommand('ProtoOANewOrderReq', orderPayload);
        logger.info('ProtoOANewOrderReq sent', { result: sendResult });
      } catch (sendErr) {
        logger.error('ProtoOANewOrderReq send error', {
          errorMessage: sendErr.message,
          errorType: sendErr.constructor.name
        });
        throw sendErr;
      }

      // Wait for execution event response
      const response = await responsePromise;

      if (!response) {
        throw new Error('No execution event received from ProtoOANewOrderReq');
      }

      // Check if it's an error response
      if (response.payloadType === 'PROTO_OA_ORDER_ERROR_EVENT' || response.type === 'ProtoOAOrderErrorEvent') {
        throw new Error(`cTrader order error: ${response.errorCode} - ${response.description || 'Unknown error'}`);
      }

      // Log the trade
      const tradeLog = loadTradeLog();
      const now = new Date();
      const timestamp = now.toISOString().replace('T', ' ').split('.')[0];

      // Extract position data from execution event
      const positionData = response.position || {};
      const dealData = response.deal || {};
      const positionId = positionData.positionId || response.positionId;
      // Try to get entry price from position, deal, or order
      const entryPrice = positionData.price || dealData.executionPrice || response.executionPrice;
      
      logger.info('Trade response price extraction', {
        positionPrice: positionData.price,
        dealExecutionPrice: dealData.executionPrice,
        responseExecutionPrice: response.executionPrice,
        extractedPrice: entryPrice,
        executionType: response.executionType
      });

      const tradeEntry = {
        symbol,
        direction: directionUpper,
        volume,
        positionId,
        openTime: timestamp,
        status: 'open',
        ...(meta || {})
      };

      // Add optional fields
      if (sl) tradeEntry.sl = sl;
      if (tp) tradeEntry.tp = tp;
      if (entryPrice) tradeEntry.entryPrice = entryPrice;

      tradeLog.push(tradeEntry);

      saveTradeLog(tradeLog);
      logger.info('Trade executed and logged', {
        positionId,
        entryPrice
      });

      // Dollar-based SL/TP targets override signal values when configured.
      // contractSize = cTrader volume units × 0.01 (volume is stored in "cents" per protocol).
      // priceDelta = dollarTarget / contractSize
      let effectiveSL = sl;
      let effectiveTP = tp;

      const settings = loadSettings();
      if (entryPrice && (settings.stopLossUSD || settings.takeProfitUSD)) {
        const contractSize = volumeInCTraderUnits * 0.01;
        const priceDecimals = SYMBOL_PRICE_DECIMALS[symbol] ?? 5;
        if (contractSize > 0) {
          if (settings.stopLossUSD) {
            const delta = settings.stopLossUSD / contractSize;
            effectiveSL = parseFloat((directionUpper === 'BUY'
              ? entryPrice - delta
              : entryPrice + delta).toFixed(priceDecimals));
          }
          if (settings.takeProfitUSD) {
            const delta = settings.takeProfitUSD / contractSize;
            effectiveTP = parseFloat((directionUpper === 'BUY'
              ? entryPrice + delta
              : entryPrice - delta).toFixed(priceDecimals));
          }
          logger.info('Dollar-based SL/TP applied', {
            positionId,
            entryPrice,
            contractSize,
            stopLossUSD: settings.stopLossUSD,
            takeProfitUSD: settings.takeProfitUSD,
            effectiveSL,
            effectiveTP
          });
        }
      }

      // Amend SL/TP on the filled position
      let slSet = false;
      let tpSet = false;
      let slError;
      let tpError;

      if (effectiveSL != null || effectiveTP != null) {
        const amendResult = await amendPositionSLTP(connection, positionId, symbol, effectiveSL, effectiveTP);
        if (amendResult.success) {
          slSet = effectiveSL != null;
          tpSet = effectiveTP != null;
          logger.info('SL/TP amendment succeeded', { positionId, slSet, tpSet });
        } else {
          if (effectiveSL != null) slError = amendResult.error;
          if (effectiveTP != null) tpError = amendResult.error;
          logger.warn('SL/TP amendment failed — trade still open without protection', {
            positionId,
            error: amendResult.error
          });
        }
      }

      const responseData = { positionId, openPrice: entryPrice };
      if (sl != null || tp != null) {
        responseData.slSet = slSet;
        responseData.tpSet = tpSet;
        if (slError) responseData.slError = slError;
        if (tpError) responseData.tpError = tpError;
      }

      res.json({
        success: true,
        data: responseData
      });
    } catch (err) {
      // Extract meaningful error message with fallback chain
      let errorMessage = 'Unknown cTrader error';
      
      // Try different ways to extract error info
      if (err && typeof err === 'object') {
        // Log the full raw error for debugging
        logger.error('Full error object', { 
          rawError: JSON.stringify(err, null, 2),
          errorKeys: Object.keys(err),
          errorType: err.constructor?.name
        });

        // Try multiple fallback approaches
        if (err.message) {
          errorMessage = err.message;
        } else if (err.description) {
          errorMessage = err.description;
        } else if (err.error) {
          errorMessage = typeof err.error === 'string' ? err.error : JSON.stringify(err.error);
        } else if (err.toString && typeof err.toString === 'function') {
          const str = err.toString();
          if (str && str !== '[object Object]') {
            errorMessage = str;
          }
        }
      } else {
        errorMessage = String(err);
      }

      logger.error('Trade execution error', { 
        error: errorMessage,
        originalError: err?.message || String(err)
      });

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  };
};
