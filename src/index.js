require('dotenv').config();

const logger = require('./utils/logger');
const ConnectionManager = require('./proxy/connection');
const ProxyServer = require('./proxy/server');
const HeartbeatManager = require('./proxy/heartbeat');
const TelegramBot = require('./bot/bot');

async function main() {
  logger.info('Starting Trading Bot...');

  try {
    // 1. Load configuration
    const config = {
      ctrader: {
        host: process.env.CTRADER_HOST || 'demo.ctraderapi.com',
        port: parseInt(process.env.CTRADER_PORT) || 5035,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        accessToken: process.env.ACCESS_TOKEN,
        refreshToken: process.env.REFRESH_TOKEN,
        accountId: process.env.ACCOUNT_ID
      },
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

    // Validate required config
    if (!config.ctrader.clientId) throw new Error('CLIENT_ID not set in .env');
    if (!config.ctrader.clientSecret) throw new Error('CLIENT_SECRET not set in .env');
    if (!config.ctrader.accessToken) throw new Error('ACCESS_TOKEN not set in .env');
    if (!config.ctrader.accountId) throw new Error('ACCOUNT_ID not set in .env');
    if (!config.telegram.token) throw new Error('TELEGRAM_BOT_TOKEN not set in .env');

    logger.info('Configuration loaded');

    // Variables for later cleanup (declared outside try block for shutdown access)
    let proxy = null;
    let heartbeat = null;
    let bot = null;

    // 2. Create cTrader connection
    const connection = new ConnectionManager(config.ctrader);

    // 3. Setup connection event handlers
    connection.on('authenticated', () => {
      logger.info('cTrader authenticated - starting proxy and bot');
      startProxyAndBot();
    });

    connection.on('disconnected', () => {
      logger.warn('cTrader connection lost');
    });

    // 4. Start cTrader connection
    await connection.connect();

    async function startProxyAndBot() {
      try {
        // 5. Start Express proxy
        proxy = new ProxyServer(config.proxy.port);
        proxy.setConnection(connection);
        await proxy.start();

        // 6. Start heartbeat
        heartbeat = new HeartbeatManager(connection);
        heartbeat.start();

        // 7. Start Telegram bot
        bot = new TelegramBot(config.telegram.token, config.telegram.allowedUsers);
        await bot.start();

        logger.info('✅ Bot fully operational');
        logger.info(`📊 Proxy running on port ${config.proxy.port}`);
        logger.info(`🤖 Telegram bot active`);
        logger.info(`💰 Account: ${config.ctrader.accountId}`);
      } catch (err) {
        logger.error('Failed to start proxy or bot', { error: err.message });
        process.exit(1);
      }
    }

    // Graceful shutdown handlers (SIGINT = Ctrl+C, SIGTERM = PM2/Docker/systemd)
    const shutdown = async (signal) => {
      logger.info(`Received ${signal} - initiating graceful shutdown...`);

      try {
        // Close new connections first
        if (proxy && proxy.server) {
          logger.info('Closing proxy server...');
          proxy.server.close(() => {
            logger.info('Proxy server closed');
          });
        }

        // Stop accepting new signals
        if (bot) {
          logger.info('Stopping Telegram bot...');
          await bot.stop();
          logger.info('Telegram bot stopped');
        }

        // Stop heartbeat
        if (heartbeat) {
          logger.info('Stopping heartbeat...');
          heartbeat.stop();
          logger.info('Heartbeat stopped');
        }

        // Close cTrader connection
        if (connection) {
          logger.info('Disconnecting from cTrader...');
          await connection.disconnect();
          logger.info('cTrader disconnected');
        }

        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message, stack: err.stack });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
    });

  } catch (err) {
    logger.error('Fatal error during startup', { error: err.message });
    process.exit(1);
  }
}

main();
