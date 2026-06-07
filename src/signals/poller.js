const { config } = require('../config');
const { parseSignal } = require('./parser');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

// Loaded lazily to avoid circular deps at startup
function getProcessSignal() {
  return require('../risk/gate').processSignal;
}

function startPoller() {
  if (!config.signalFeed.enabled) {
    log('Signal feed disabled');
    return;
  }
  if (!config.signalFeed.url) {
    log('No signal feed URL configured');
    return;
  }

  let lastSeenTimestamp = null;
  let wasErrored = false;

  async function poll() {
    let response;
    try {
      response = await fetch(config.signalFeed.url, { timeout: 8000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (!wasErrored) log(`Warning: signal feed fetch failed: ${err.message}`);
      wasErrored = true;
      return;
    }

    if (wasErrored) {
      log('Signal feed reconnected');
      wasErrored = false;
    }

    let alerts;
    try {
      alerts = await response.json();
    } catch (err) {
      log(`Error: signal feed returned malformed JSON: ${err.message}`);
      return;
    }

    if (!Array.isArray(alerts) || alerts.length === 0) {
      if (alerts !== null) log('Warning: signal feed response is empty or not an array');
      return;
    }

    if (lastSeenTimestamp === null) {
      lastSeenTimestamp = alerts.reduce((max, a) => (a.timestamp > max ? a.timestamp : max), alerts[0].timestamp);
      log(`Signal feed connected. Monitoring for new signals. Last seen: ${lastSeenTimestamp}`);
      return;
    }

    const newAlerts = alerts
      .filter(a => a.timestamp > lastSeenTimestamp)
      .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

    if (newAlerts.length === 0) return;

    log(`Poll: ${newAlerts.length} new signal${newAlerts.length > 1 ? 's' : ''} found`);

    const processSignal = getProcessSignal();
    for (const alert of newAlerts) {
      const signal = parseSignal(alert);
      if (!signal) continue;
      try {
        await processSignal(signal);
      } catch (err) {
        log(`Error processing signal ${signal.direction} ${signal.symbol}: ${err.message}`);
      }
    }

    lastSeenTimestamp = newAlerts[newAlerts.length - 1].timestamp;
  }

  setInterval(poll, 10000);
}

module.exports = { startPoller };
