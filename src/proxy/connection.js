const { CTraderConnection } = require('@reiryoku/ctrader-layer');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class ConnectionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || 'demo.ctraderapi.com';
    this.port = options.port || 5035;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.accountId = options.accountId;
    
    this.connection = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 6; // 1s, 2s, 4s, 8s, 16s, 32s, max 60s
    this.reconnectTimer = null;
  }

  getReconnectDelay() {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (capped at 60s)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    return delay;
  }

  async connect() {
    try {
      logger.info('Connecting to cTrader', {
        host: this.host,
        port: this.port,
        accountId: this.accountId
      });

      this.connection = new CTraderConnection({
        host: this.host,
        port: this.port
      });

      // Forward all events from the underlying connection to this manager
      // This allows listeners on ConnectionManager to receive CTrader events
      this.connection.on('ProtoOAExecutionEvent', (event) => {
        // CTraderLayerEvent wraps payload in descriptor getter
        const descriptor = event.descriptor || {};
        logger.info('Forwarding ProtoOAExecutionEvent', {
          eventType: event.type,
          descriptor: descriptor,
          keys: Object.keys(descriptor)
        });
        this.emit('ProtoOAExecutionEvent', descriptor);
      });

      this.connection.on('ProtoOAOrderErrorEvent', (event) => {
        // CTraderLayerEvent wraps payload in descriptor getter
        const descriptor = event.descriptor || {};
        logger.info('Forwarding ProtoOAOrderErrorEvent', {
          eventType: event.type,
          descriptor: descriptor,
          keys: Object.keys(descriptor)
        });
        this.emit('ProtoOAOrderErrorEvent', descriptor);
      });

      this.connection.on('ProtoOATradeStatusEvent', (event) => {
        const descriptor = event.descriptor || {};
        logger.info('Forwarding ProtoOATradeStatusEvent', {
          eventType: event.type,
          descriptor: descriptor
        });
        this.emit('ProtoOATradeStatusEvent', descriptor);
      });

      // Wait for socket to open (TCP connection established)
      await this.connection.open();
      logger.info('cTrader socket opened');

      // Now authenticate
      await this.authenticateApp();
      await this.authenticateAccount();
      
      this.isConnected = true;
      this.isAuthenticated = true;
      this.reconnectAttempts = 0;
      
      logger.info('cTrader authentication successful', { accountId: this.accountId });
      this.emit('authenticated');
    } catch (err) {
      const errDetail = err?.message || JSON.stringify(err, null, 2) || String(err);
      logger.error('Failed to connect to cTrader', { error: errDetail, raw: err });
      this.scheduleReconnect();
    }
  }

  async authenticateApp() {
    logger.info('Sending ProtoOAApplicationAuthReq');
    
    try {
      const response = await this.connection.sendCommand('ProtoOAApplicationAuthReq', {
        clientId: this.clientId,
        clientSecret: this.clientSecret
      });
      
      logger.info('Application authenticated', response);
      return response;
    } catch (err) {
      logger.error('Application auth failed', { error: err.message });
      throw err;
    }
  }

  async authenticateAccount() {
    logger.info('Sending ProtoOAAccountAuthReq', {
      accessToken: this.accessToken ? 'set' : 'missing',
      ctidTraderAccountId: this.accountId
    });
    
    try {
      // Note: cTrader uses 'ctidTraderAccountId' for the account ID field
      // Must be sent as integer, not string
      const response = await this.connection.sendCommand('ProtoOAAccountAuthReq', {
        accessToken: this.accessToken,
        ctidTraderAccountId: parseInt(this.accountId)
      });
      
      logger.info('Account authenticated', response);
      return response;
    } catch (err) {
      const descriptor = err?.descriptor || err?.payload || {};
      logger.error('Account auth failed', {
        message: err.message,
        descriptor,
        errorCode: descriptor.errorCode,
        description: descriptor.description,
        raw: JSON.stringify(err)
      });
      throw err;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      this.emit('max-reconnect-failed');
      return;
    }

    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;
    
    logger.info(`Scheduling reconnect in ${delay}ms`, {
      attempt: this.reconnectAttempts
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.connection) {
      try {
        this.connection.close();
      } catch (err) {
        logger.error('Error disconnecting', { error: err.message });
      }
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      accountId: this.accountId
    };
  }

  async send(command) {
    if (!this.isConnected || !this.isAuthenticated) {
      throw new Error('Not connected or authenticated to cTrader');
    }
    
    // command should be { type: 'ProtoOAXXXReq', ...payload }
    if (!command.type) {
      throw new Error('Command must have a type property');
    }
    
    try {
      const response = await this.connection.sendCommand(command.type, command);
      return response;
    } catch (err) {
      logger.error('Command failed', { command: command.type, error: err.message });
      throw err;
    }
  }

  on(event, listener) {
    return super.on(event, listener);
  }
}

module.exports = ConnectionManager;
