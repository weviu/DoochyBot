/**
 * Test Mode Entry Point - No cTrader Connection
 * 
 * Allows testing TradingView webhook flow without cTrader API access
 * 
 * Usage: node src/index-test.js
 * 
 * Features:
 * - Skips cTrader connection
 * - Runs Express proxy on port 9009
 * - Runs Telegram bot
 * - Accepts TradingView webhooks
 * - Sends confirmations to Telegram
 */

require('dotenv').config();

const logger = require('./utils/logger');
const ProxyServer = require('./proxy/server');
const TelegramBot = require('./bot/bot');
const { setBot, setTelegramBot } = require('./bot/instance');

// Mock connection object (doesn't actually connect to cTrader)
class MockConnection {
  constructor() {
    this.isConnected = true;
    this.isAuthenticated = true;
    this.accountId = process.env.ACCOUNT_ID || 'test-account';
  }

  getStatus() {
    return {
      connected: true,
      authenticated: true,
      accountId: this.accountId
    };
  }

  async send(command) {
    logger.info('Mock trade execution (no real cTrader)', command);
    return {
      success: true,
      data: {
        positionId: Math.floor(Math.random() * 1000000),
        openPrice: Math.random() * 100,
        timestamp: new Date().toISOString()
      }
    };
  }

  async disconnect() {
    logger.info('Mock connection closed');
  }
}

async function main() {
  logger.info('Starting Trading Bot in TEST MODE (no cTrader)');

  try {
    const config = {
      proxy: {
        port: parseInt(process.env.PROXY_PORT) || 9009
      },
      telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        allowedUsers: (process.env.ALLOWED_USERS || '')
          .split(',')
          .map(u => parseInt(u.trim()))
          .filter(u => !isNaN(u))
      }
    };

    if (!config.telegram.token) {
      throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
    }

    logger.info('Configuration loaded (test mode)');

    // Create mock connection
    const connection = new MockConnection();
    logger.info('Mock cTrader connection created');

    // Start Express proxy
    const proxy = new ProxyServer(config.proxy.port);
    proxy.setConnection(connection);
    await proxy.start();
    logger.info(`✅ Proxy running on port ${config.proxy.port}`);

    // Start Telegram bot
    const bot = new TelegramBot(config.telegram.token, config.telegram.allowedUsers);
    await bot.start();
    logger.info('✅ Telegram bot active');

    logger.info('');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('🧪 TEST MODE ACTIVE');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info(`📊 Proxy endpoint:  http://localhost:${config.proxy.port}`);
    logger.info(`🤖 Telegram token:  ${config.telegram.token.substring(0, 20)}...`);
    logger.info(`👥 Allowed users:   ${config.telegram.allowedUsers.join(', ') || 'None'}`);
    logger.info('');
    logger.info('💡 Test the webhook:');
    logger.info('   curl -X POST http://localhost:9009/webhook \\');
    logger.info('        -H "Content-Type: text/plain" \\');
    logger.info('        -d "BUY BTCUSD SL=65000 TP=67000"');
    logger.info('');
    logger.info('📱 In Telegram: Send /setchatid to register your chat');
    logger.info('                Then send signals or use webhooks');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('');

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal} - initiating graceful shutdown...`);
      try {
        if (proxy && proxy.server) {
          logger.info('Closing proxy server...');
          proxy.server.close();
        }

        if (bot) {
          logger.info('Stopping Telegram bot...');
          await bot.stop();
        }

        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Fatal error during startup', { error: err.message });
    process.exit(1);
  }
}

main();
