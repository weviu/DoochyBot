require('dotenv').config();

const TelegramBot = require('./src/bot/bot');
const express = require('express');
const logger = require('./src/utils/logger');
const fs = require('fs');
const path = require('path');

// Create mock connection object that mimics the real one
class MockConnection {
  constructor() {
    this.isConnected = true;
    this.isAuthenticated = true;
    this.accountId = process.env.ACCOUNT_ID || '12345';
    this.positions = [];
  }

  getStatus() {
    return {
      connected: true,
      authenticated: true,
      accountId: this.accountId
    };
  }
}

// Create mock proxy server
const app = express();
app.use(express.json());

const mockConn = new MockConnection();
const positions = [
  {
    positionId: '1',
    symbol: 'BTCUSD',
    direction: 'BUY',
    volume: 0.01,
    openPrice: 65000,
    currentPrice: 65200,
    sl: 64900,
    tp: 66000,
    pnl: 2.00,
    openTime: new Date().toISOString()
  }
];

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'connected',
      accountId: mockConn.accountId,
      connected: true,
      authenticated: true
    }
  });
});

app.get('/balance', (req, res) => {
  res.json({
    success: true,
    data: {
      equity: 10000,
      balance: 9500,
      margin: 500,
      freeMargin: 9500,
      marginLevel: 95
    }
  });
});

app.get('/positions', (req, res) => {
  res.json({
    success: true,
    data: positions
  });
});

app.post('/trade', (req, res) => {
  const { symbol, direction, volume, sl, tp } = req.body;
  
  const newPos = {
    positionId: Math.floor(Math.random() * 1000000),
    symbol,
    direction,
    volume,
    openPrice: Math.random() * 10000,
    currentPrice: Math.random() * 10000,
    sl,
    tp,
    pnl: (Math.random() - 0.5) * 100,
    openTime: new Date().toISOString()
  };
  
  positions.push(newPos);
  logger.info('Trade executed', { symbol, direction, volume, sl, tp });
  
  res.json({
    success: true,
    data: {
      orderId: Math.floor(Math.random() * 100000),
      positionId: newPos.positionId,
      executionPrice: newPos.openPrice
    }
  });
});

app.post('/close/:positionId', (req, res) => {
  const { positionId } = req.params;
  const idx = positions.findIndex(p => p.positionId === positionId);
  if (idx > -1) {
    positions.splice(idx, 1);
  }
  
  res.json({
    success: true,
    data: {
      positionId,
      closedAt: new Date().toISOString()
    }
  });
});

app.post('/closeall', (req, res) => {
  const closedCount = positions.length;
  positions.length = 0;
  
  res.json({
    success: true,
    data: {
      closedCount,
      failedCount: 0,
      failures: []
    }
  });
});

// Start proxy
const PORT = 9009;
const proxyServer = app.listen(PORT, () => {
  logger.info(`✅ Mock proxy ready on port ${PORT}`);
});

// Start bot
const allowedUsers = (process.env.ALLOWED_USERS || '')
  .split(',')
  .map(u => parseInt(u.trim()))
  .filter(u => !isNaN(u));

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, allowedUsers);

bot.start().then(() => {
  logger.info('✅ Full Telegram bot ready with all commands');
}).catch(err => {
  logger.error('Failed to start bot', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await bot.stop();
  proxyServer.close();
  process.exit(0);
});
