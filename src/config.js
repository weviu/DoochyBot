require('dotenv').config();

const config = {
  ctrader: {
    host: process.env.CTRADER_HOST,
    port: parseInt(process.env.CTRADER_PORT, 10),
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    accessToken: process.env.ACCESS_TOKEN,
    refreshToken: process.env.REFRESH_TOKEN,
    accountId: parseInt(process.env.ACCOUNT_ID, 10),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    allowedUsers: process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(s => s.trim()) : [],
  },
  signalFeed: {
    enabled: process.env.SIGNAL_FEED_ENABLED === 'true',
    url: process.env.SIGNAL_FEED_URL,
  },
};

const SYMBOL_ALIASES = {
  "AAVE": "AAVUSD",
  "ALGO": "ALGUSD",
  "AVAX": "AVAUSD",
  "LINK": "LNKUSD",
};

function resolveSymbol(raw) {
  const base = raw.split('/')[0].split(':')[0].toUpperCase();
  return SYMBOL_ALIASES[base] || (base + 'USD');
}

const SYMBOL_GROUPS = {
  crypto: [
    'AAVUSD', 'ADAUSD', 'ALGUSD', 'AVAUSD', 'BARUSD', 'BCHUSD', 'BNBUSD', 'BTCUSD',
    'DASHUSD', 'DOGEUSD', 'DOTUSD', 'ETCUSD', 'ETHUSD', 'FETUSD', 'GALUSD', 'GRTUSD',
    'ICPUSD', 'IMXUSD', 'LNKUSD', 'LTCUSD', 'MANUSD', 'NEOUSD', 'NERUSD', 'SANUSD',
    'SOLUSD', 'UNIUSD', 'VECUSD', 'XLMUSD', 'XMRUSD', 'XRPUSD', 'XTZUSD',
  ],
  indices: [
    'AUS200.cash', 'DXY.cash', 'EU50.cash', 'FRA40.cash', 'GER40.cash', 'HK50.cash',
    'JP225.cash', 'N25.cash', 'SPN35.cash', 'UK100.cash', 'US100.cash', 'US2000.cash',
    'US30.cash', 'US500.cash',
  ],
  commodities: [
    'USOIL.cash', 'XCUUSD', 'XAGAUD', 'XAGEUR', 'XAGUSD', 'XAUAUD', 'XAUEUR', 'XAUUSD', 'XPDUSD', 'XPTUSD',
  ],
};

const DEFAULT_LOT_SIZES = (() => {
  const sizes = {};
  const all = [...SYMBOL_GROUPS.crypto, ...SYMBOL_GROUPS.indices, ...SYMBOL_GROUPS.commodities];
  for (const sym of all) sizes[sym] = 0.1;
  sizes['BTCUSD'] = 0.01;
  sizes['XAUUSD'] = 0.05;
  sizes['XAUAUD'] = 0.05;
  sizes['XAUEUR'] = 0.05;
  sizes['XAGUSD'] = 0.5;
  sizes['XAGAUD'] = 0.5;
  sizes['XAGEUR'] = 0.5;
  return sizes;
})();

const DEFAULT_SETTINGS = {
  paused: false,
  allowedSymbols: [
    ...SYMBOL_GROUPS.crypto,
    ...SYMBOL_GROUPS.indices,
    ...SYMBOL_GROUPS.commodities,
  ],
  lotSizes: { ...DEFAULT_LOT_SIZES },
  maxPositions: 5,
  dailyLossLimitPercent: 2,
  maxDailyLossUSD: 200,
  riskMode: "fixed",
  riskPercent: 1,
  stopLossUSD: 30,
  takeProfitUSD: 45,
  stopLossPercent: 2,
  takeProfitPercent: 3,
  sltpMode: "auto",
  minHoldSeconds: 60,
  confirmMode: false,
};

module.exports = { config, SYMBOL_ALIASES, resolveSymbol, SYMBOL_GROUPS, DEFAULT_LOT_SIZES, DEFAULT_SETTINGS };
