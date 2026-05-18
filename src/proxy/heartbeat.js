const logger = require('../utils/logger');

class HeartbeatManager {
  constructor(connection) {
    this.connection = connection;
    this.heartbeatInterval = null;
    this.lastHeartbeatTime = null;
    this.heartbeatTimeout = null;
    this.isStale = false;
  }

  start() {
    logger.info('Starting heartbeat manager (25s interval, 10s timeout)');
    
    // Send heartbeat every 25 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);
  }

  async sendHeartbeat() {
    try {
      if (!this.connection.isConnected || !this.connection.isAuthenticated) {
        logger.warn('Cannot send heartbeat - connection not ready');
        return;
      }

      this.lastHeartbeatTime = Date.now();
      this.isStale = false;

      // Send ProtoHeartbeatEvent using the library's sendCommand
      await this.connection.connection.sendCommand('ProtoHeartbeatEvent', {});

      logger.info('Heartbeat sent');

      // Set timeout for response
      this.heartbeatTimeout = setTimeout(() => {
        this.onHeartbeatTimeout();
      }, 10000);

    } catch (err) {
      logger.error('Failed to send heartbeat', { error: err.message });
    }
  }

  onHeartbeatTimeout() {
    logger.warn('Heartbeat timeout - marking connection as stale');
    this.isStale = true;
    this.connection.emit('heartbeat-timeout');
  }

  onHeartbeatResponse() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
    this.isStale = false;
    logger.info('Heartbeat response received');
  }

  stop() {
    logger.info('Stopping heartbeat manager');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }
  }

  getStatus() {
    return {
      lastHeartbeat: this.lastHeartbeatTime,
      isStale: this.isStale
    };
  }
}

module.exports = HeartbeatManager;
