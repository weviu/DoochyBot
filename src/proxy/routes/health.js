const logger = require('../../utils/logger');

module.exports = (connection) => {
  return async (req, res) => {
    try {
      const status = connection.getStatus();
      
      res.json({
        success: true,
        data: {
          status: status.connected ? (status.authenticated ? 'connected' : 'authenticating') : 'disconnected',
          accountId: status.accountId,
          connected: status.connected,
          authenticated: status.authenticated
        }
      });
    } catch (err) {
      logger.error('Health check error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
