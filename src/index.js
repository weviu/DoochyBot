const { config } = require('./config');
const CtraderConnection = require('./ctrader/connection');
const { runStartup } = require('./startup');
const { startPoller } = require('./signals/poller');
const { setConnection } = require('./ctrader/orders');
const { setupEventListeners } = require('./ctrader/events');
const { startBot } = require('./bot/bot');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

async function main() {
  const connection = new CtraderConnection(config.ctrader);

  await connection.connect();
  await runStartup(connection);
  setConnection(connection);
  setupEventListeners(connection);
  startPoller();
  log('Signal poller started');
  startBot();
  log('DoochyBot ready');

  process.on('SIGINT', () => shutdown(connection));
  process.on('SIGTERM', () => shutdown(connection));
}

function shutdown(connection) {
  connection.disconnect();
  console.log(`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] Shutdown complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] Startup failed: ${err.message}`);
  process.exit(1);
});
