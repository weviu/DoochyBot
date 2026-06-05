require('dotenv').config();

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const ConnectionManager = require('./proxy/connection');
const ProxyServer = require('./proxy/server');
const HeartbeatManager = require('./proxy/heartbeat');
const TelegramBot = require('./bot/bot');
const { init: initSync, startSync } = require('./proxy/syncPositions');
const { init: initPriceCache } = require('./proxy/priceCache');
const dailyPnL = require('./proxy/dailyPnL');

const POSITIONS_FILE = path.join(__dirname, 'state/positions.json');

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

    // Keep positions.json in sync with cTrader: remove positions closed externally
    connection.on('ProtoOAExecutionEvent', (event) => {
      const pos = event.position;
      if (!pos || !pos.positionId) return;

      // positionStatus is 'POSITION_STATUS_CLOSED' (string) or 2 (number) depending on protobuf encoding
      const isClosed = pos.positionStatus === 'POSITION_STATUS_CLOSED' || pos.positionStatus === 2;
      if (!isClosed) return;

      // Update daily realized P&L (async — balance fetch for limit check)
      if (event.deal) {
        dailyPnL.onPositionClose(event.deal).catch(err =>
          logger.warn('dailyPnL.onPositionClose error', { error: err.message })
        );
      }

      try {
        const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
        const updated = positions.filter(p => String(p.positionId) !== String(pos.positionId));
        if (updated.length !== positions.length) {
          fs.writeFileSync(POSITIONS_FILE, JSON.stringify(updated, null, 2));
          logger.info('Position closed externally — removed from positions.json', {
            positionId: pos.positionId
          });
        }
      } catch (err) {
        logger.error('Failed to sync positions.json on external close', { error: err.message });
      }
    });

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

        // 6b. Start position sync (immediate + every 30s)
        initSync(connection);
        startSync(30000);

        // 6c. Initialise daily P&L tracker (fetches today's history from cTrader)
        dailyPnL.init(connection).catch(err =>
          logger.warn('Daily P&L init failed', { error: err.message })
        );

        // 6d. Subscribe to live spot prices for PnL display
        initPriceCache(connection);

        // Log active profile
        try {
          const _settings = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, 'state/settings.json'), 'utf-8'
          ));
          const _profile = _settings.activeProfile ?? 'custom';
          logger.info(`Active profile: ${_profile} (daily loss: ${_settings.dailyLossLimit ?? '?'}%, risk: ${_settings.riskPercent ?? '?'}%, max positions: ${_settings.maxPositions ?? '?'})`);
        } catch (_) {}

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
