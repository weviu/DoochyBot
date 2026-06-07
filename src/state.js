const state = {
  paused: false,
  tradingLocked: false,
  dailyRealizedPnL: 0,
  positions: new Map(),       // positionId → { symbol, direction, entryPrice, volume, sl, tp, openTime }
  lastSignalTime: new Map(),  // "SYMBOL:DIRECTION" → timestamp
  executionLock: new Map(),   // "SYMBOL:DIRECTION" → timestamp
  settings: {},               // loaded from storage on startup
  symbolMap: new Map(),       // "BTCUSD" → { symbolId, lotSize, contractSize }
  accountInfo: {
    balance: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    currency: "USD",
  },
};

module.exports = state;
