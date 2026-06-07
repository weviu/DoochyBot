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

const DEFAULT_SETTINGS = {
  paused: false,
  allowedSymbols: ["BTCUSD", "XAUUSD", "XAGUSD"],
  lotSizes: { "BTCUSD": 0.05, "XAUUSD": 0.05, "XAGUSD": 0.5 },
  maxPositions: 5,
  dailyLossLimitPercent: 2,
  maxDailyLossUSD: 200,
  riskMode: "fixed",
  riskPercent: 1,
  stopLossUSD: 30,
  takeProfitUSD: 45,
  sltpMode: "auto",
  minHoldSeconds: 60,
  confirmMode: false,
};

module.exports = { config, SYMBOL_ALIASES, resolveSymbol, DEFAULT_SETTINGS };
