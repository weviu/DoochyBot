const express = require('express');
const logger = require('../utils/logger');

class ProxyServer {
  constructor(port = 9009) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.connection = null;
  }

  setConnection(connection) {
    this.connection = connection;
  }

  setupMiddleware() {
    // Webhook endpoint needs text/plain parsing (must be before json parser)
    // This regex matches only POST /webhook
    this.app.post('/webhook', express.text({ type: 'text/plain' }));
    
    // All other routes use JSON by default
    this.app.use(express.json());

    // Global error handler middleware
    this.app.use((err, req, res, next) => {
      logger.error('Express error', { error: err.message, path: req.path });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  registerRoutes() {
    // Import route handlers
    const healthRoute = require('./routes/health');
    const balanceRoute = require('./routes/balance');
    const positionsRoute = require('./routes/positions');
    const tradeRoute = require('./routes/trade');
    const closeRoute = require('./routes/close');
    const closeAllRoute = require('./routes/closeall');
    const webhookRoute = require('./routes/webhook');

    // Register routes
    this.app.get('/health', healthRoute(this.connection));
    this.app.get('/balance', balanceRoute(this.connection));
    this.app.get('/positions', positionsRoute(this.connection));
    this.app.post('/trade', tradeRoute(this.connection));
    this.app.post('/close/:positionId', closeRoute(this.connection));
    this.app.post('/closeall', closeAllRoute(this.connection));
    
    // Webhook route handler (text parsing middleware already registered in setupMiddleware)
    this.app.post('/webhook', webhookRoute(this.connection));

    // Catch-all for undefined routes
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }

  async start() {
    if (!this.connection) {
      throw new Error('Connection not set');
    }

    this.setupMiddleware();
    this.registerRoutes();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Proxy server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Proxy server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = ProxyServer;
