// Number of decimal places allowed for SL/TP prices on this broker (from ProtoOASymbol.digits).
// Using too many decimals causes TRADING_BAD_STOPS. Defaults to 5 for unknown symbols.
const SYMBOL_PRICE_DECIMALS = {
  // Forex
  'EURUSD': 5, 'GBPUSD': 5, 'AUDUSD': 5, 'USDCHF': 5, 'USDCAD': 5, 'NZDUSD': 5,
  'USDJPY': 3,
  // Metals
  'XAUUSD': 2, 'GOLD': 2, 'XAGUSD': 3, 'XPDUSD': 2, 'XPTUSD': 2, 'XCUUSD': 3,
  'USOIL': 3, 'OIL': 3,
  // Indices
  'US500.cash': 2, 'US100.cash': 2, 'US30.cash': 2,
  // Crypto high-value (>$10, 2 decimal places)
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'BNBUSD': 2, 'LTCUSD': 2, 'BCHUSD': 2,
  'XMRUSD': 2, 'AAVUSD': 2, 'ETCUSD': 2, 'LNKUSD': 2, 'AVAUSD': 2, 'NEOUSD': 2,
  'DASHUSD': 2, 'DOTUSD': 3, 'XTZUSD': 3, 'ICPUSD': 3, 'IMXUSD': 3,
  // Crypto low-value (<$1, 5 decimal places)
  'XRPUSD': 5, 'ADAUSD': 5, 'DOGEUSD': 5, 'XLMUSD': 5, 'NERUSD': 5, 'UNIUSD': 5,
  'MANUSD': 5, 'ALGUSD': 5, 'SANUSD': 5, 'BARUSD': 5, 'GALUSD': 5, 'VECUSD': 5,
  'GRTUSD': 5, 'FETUSD': 5,
};

const SYMBOL_LOT_SIZE = {
  // Forex
  'EURUSD':  10000000, 'GBPUSD':  10000000, 'USDJPY': 10000000,
  'AUDUSD':  10000000, 'USDCHF':  10000000, 'USDCAD': 10000000,
  'NZDUSD':  10000000,
  // Metals & Commodities
  'XAUUSD':  10000, 'GOLD':    10000, 'XAGUSD':  10000,
  'XPDUSD':  10000, 'XPTUSD':  10000, 'XCUUSD':  10000,
  'USOIL':   10000, 'OIL':     10000,
  // Indices
  'US500.cash': 10000, 'US100.cash': 10000, 'US30.cash': 10000,
  // Crypto
  'BTCUSD':  100,       'ETHUSD':  1000,
  'SOLUSD':  10000,     'BNBUSD':  10000,
  'LTCUSD':  10000,     'BCHUSD':  10000,
  'XMRUSD':  10000,     'AAVUSD':  10000,
  'ETCUSD':  100000,    'LNKUSD':  100000,
  'AVAUSD':  100000,    'NEOUSD':  100000,
  'DASHUSD': 100000,
  'XRPUSD':  1000000,   'DOTUSD':  1000000,
  'NERUSD':  1000000,   'UNIUSD':  1000000,
  'ICPUSD':  1000000,
  'ADAUSD':  10000000,  'DOGEUSD': 10000000,
  'XLMUSD':  10000000,  'BARUSD':  10000000,
  'XTZUSD':  10000000,  'SANUSD':  10000000,
  'ALGUSD':  10000000,  'MANUSD':  10000000,
  'IMXUSD':  10000000,  'FETUSD':  10000000,
  'GALUSD':  100000000, 'VECUSD':  100000000,
  'GRTUSD':  100000000,
};

module.exports = { SYMBOL_LOT_SIZE, SYMBOL_PRICE_DECIMALS };
