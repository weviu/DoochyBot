const logger = require('../utils/logger');
const { COMMON_SYMBOLS } = require('../utils/symbols');

// symbolId (string) → { bid, ask, updatedAt }
// bid/ask are raw pipette integers from ProtoOASpotEvent (divide by 10^digits to get price)
const _prices = new Map();

function init(connection) {
  const uniqueIds = [...new Set(Object.values(COMMON_SYMBOLS))];

  connection.connection.sendCommand('ProtoOASubscribeSpotsReq', {
    ctidTraderAccountId: parseInt(connection.accountId),
    symbolId: uniqueIds
  }).catch(err =>
    logger.warn('Spot subscription failed', { error: err.message })
  );

  connection.on('ProtoOASpotEvent', (event) => {
    if (String(event.ctidTraderAccountId) !== String(connection.accountId)) return;
    const id = String(event.symbolId);
    const prev = _prices.get(id) || {};
    _prices.set(id, {
      bid: event.bid != null ? Number(event.bid) : prev.bid,
      ask: event.ask != null ? Number(event.ask) : prev.ask,
      updatedAt: Date.now()
    });
  });

  logger.info('Price cache initialised', { symbols: uniqueIds.length });
}

// Returns { bid, ask } in raw pipette units, or null if no price yet.
function getRawPrice(symbolId) {
  return _prices.get(String(symbolId)) ?? null;
}

module.exports = { init, getRawPrice };
