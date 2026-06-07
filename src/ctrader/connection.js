const { CTraderConnection } = require('@reiryoku/ctrader-layer');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

class CtraderConnection {
  constructor(config) {
    this.config = config;
    this._conn = null;
    this._heartbeatInterval = null;
  }

  async connect() {
    log('Connecting to cTrader...');
    this._conn = new CTraderConnection({ host: this.config.host, port: this.config.port });
    await this._conn.open();
    await this._conn.sendCommand('ProtoOAApplicationAuthReq', {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });
    log('Application authenticated');
    await this._conn.sendCommand('ProtoOAAccountAuthReq', {
      accessToken: this.config.accessToken,
      ctidTraderAccountId: this.config.accountId,
    });
    log('Account authenticated');
    this._startHeartbeat();
    return true;
  }

  async reconnect() {
    this.disconnect();
    const delays = [1, 2, 4, 8, 16, 30];
    let attempt = 0;
    while (true) {
      const delay = delays[Math.min(attempt, delays.length - 1)];
      log(`Reconnecting in ${delay}s (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, delay * 1000));
      try {
        await this.connect();
        log('Reconnected to cTrader');
        return;
      } catch (err) {
        const fatal = err.errorCode === 'WRONG_CREDENTIALS' || err.errorCode === 'ACCOUNT_LOCKED';
        if (fatal) {
          log(`Fatal: ${err.errorCode}. Stopping.`);
          process.exit(1);
        }
        log(`Reconnect attempt ${attempt + 1} failed: ${err.message || JSON.stringify(err)}`);
        attempt++;
      }
    }
  }

  _startHeartbeat() {
    clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = setInterval(() => {
      this._conn.sendHeartbeat();
    }, 25000);
  }

  async sendCommand(type, payload) {
    return this._conn.sendCommand(type, payload);
  }

  on(eventName, listener) {
    return this._conn.on(eventName, listener);
  }

  removeEventListener(uuid) {
    this._conn.removeEventListener(uuid);
  }

  disconnect() {
    clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = null;
    if (this._conn) this._conn.close();
    log('Disconnected');
  }
}

module.exports = CtraderConnection;
