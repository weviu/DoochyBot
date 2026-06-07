const state = require('../state');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function fmt(n) {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function checkDailyLoss() {
  const percentLimit = state.accountInfo.balance * (state.settings.dailyLossLimitPercent / 100);
  const maxLoss = Math.min(percentLimit, state.settings.maxDailyLossUSD);

  if (state.dailyRealizedPnL < -maxLoss) {
    state.tradingLocked = true;
    log(`DAILY LOSS LIMIT BREACHED. P&L: ${fmt(state.dailyRealizedPnL)}. Limit: -$${maxLoss.toFixed(2)}. Trading locked.`);
    require('../bot/bot').sendAlert(`Daily loss limit reached. Trading locked.`);
    return true;
  }
  return false;
}

function updateDailyPnL(closedPnl) {
  state.dailyRealizedPnL += closedPnl;
  log(`Daily P&L updated: ${fmt(closedPnl)} (total: ${fmt(state.dailyRealizedPnL)})`);

  if (checkDailyLoss()) {
    log('Trading locked for the day. Use /pnl reset to unlock (if limit was raised).');
  }
}

module.exports = { checkDailyLoss, updateDailyPnL };
