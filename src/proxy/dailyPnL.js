const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '../state/dailyState.json');
const SETTINGS_FILE = path.join(__dirname, '../state/settings.json');

// In-memory state — always reflects STATE_FILE
let _state = { date: null, realizedPnL: 0, tradingLocked: false, dailyStopLosses: 0 };
let _connection = null;

function _today() {
  return new Date().toISOString().split('T')[0];
}

function _loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch { return {}; }
}

function _saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2));
}

// Reset state if date rolled over
function _ensureToday() {
  const today = _today();
  if (_state.date !== today) {
    _state = { date: today, realizedPnL: 0, tradingLocked: false, dailyStopLosses: 0 };
    _saveState();
  }
}

// Fetch today's closed-position P&L from cTrader deal history
async function _fetchFromCTrader() {
  if (!_connection) return;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const response = await _connection.connection.sendCommand('ProtoOADealListReq', {
      ctidTraderAccountId: parseInt(_connection.accountId),
      fromTimestamp: todayStart.getTime(),
      toTimestamp: Date.now()
    });

    let total = 0;
    for (const deal of response.deal || []) {
      if (deal.dealStatus !== 'FILLED' && deal.dealStatus !== 2) continue;
      if (!deal.closePositionDetail) continue;
      const cpd = deal.closePositionDetail;
      const scale = Math.pow(10, cpd.moneyDigits ?? deal.moneyDigits ?? 2);
      total += (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / scale;
    }

    _state.realizedPnL = parseFloat(total.toFixed(2));
    _saveState();
    logger.info('Daily P&L initialised from cTrader', { realizedPnL: _state.realizedPnL });
  } catch (err) {
    logger.warn('Could not fetch today P&L from cTrader', { error: err.message });
  }
}

async function _fetchBalance() {
  if (!_connection) return 0;
  try {
    const response = await _connection.connection.sendCommand('ProtoOATraderReq', {
      ctidTraderAccountId: parseInt(_connection.accountId)
    });
    const trader = response.trader || {};
    const divisor = Math.pow(10, trader.moneyDigits || 2);
    return (trader.balance || 0) / divisor;
  } catch (err) {
    logger.warn('Could not fetch balance for loss limit check', { error: err.message });
    return 0;
  }
}

function _sendStopLossLimitAlert(count, max) {
  try {
    const { getBot } = require('../bot/instance');
    const bot = getBot();
    if (!bot) return;
    const settings = _loadSettings();
    if (!settings.chatId) return;
    bot.api.sendMessage(parseInt(settings.chatId),
      `🚨 Max daily stop losses hit!\n` +
      `${count} losing trade${count > 1 ? 's' : ''} today (limit: ${max})\n` +
      `Trading locked — use /pnl reset to unlock.`
    ).catch(err => logger.warn('Failed to send stop loss limit alert', { error: err.message }));
  } catch (err) {
    logger.warn('Stop loss limit alert error', { error: err.message });
  }
}

function _sendDollarLockAlert(maxLossUSD) {
  try {
    const { getBot } = require('../bot/instance');
    const bot = getBot();
    if (!bot) return;
    const settings = _loadSettings();
    if (!settings.chatId) return;
    bot.api.sendMessage(parseInt(settings.chatId),
      `🚨 Max daily loss hit!\n` +
      `Realized P&L today: $${_state.realizedPnL.toFixed(2)}\n` +
      `Limit: -$${Math.abs(maxLossUSD)}\n` +
      `Trading locked — use /pnl reset to unlock.`
    ).catch(err => logger.warn('Failed to send dollar lock alert', { error: err.message }));
  } catch (err) {
    logger.warn('Dollar lock alert error', { error: err.message });
  }
}

function _sendLockAlert(limitPct, threshold) {
  try {
    const { getBot } = require('../bot/instance');
    const bot = getBot();
    if (!bot) return;
    const settings = _loadSettings();
    if (!settings.chatId) return;
    bot.api.sendMessage(parseInt(settings.chatId),
      `🚨 Daily loss limit hit!\n` +
      `Realized P&L today: $${_state.realizedPnL.toFixed(2)}\n` +
      `Limit: ${limitPct}% ($${threshold.toFixed(2)})\n` +
      `Trading locked — use /pnl reset to unlock.`
    ).catch(err => logger.warn('Failed to send lock alert', { error: err.message }));
  } catch (err) {
    logger.warn('Lock alert error', { error: err.message });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

async function init(connection) {
  _connection = connection;

  let saved = { date: null, realizedPnL: 0, tradingLocked: false };
  try {
    if (fs.existsSync(STATE_FILE)) {
      saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}

  const today = _today();
  _state = saved.date === today
    ? { dailyStopLosses: 0, ...saved }
    : { date: today, realizedPnL: 0, tradingLocked: false, dailyStopLosses: 0 };

  // Always re-fetch from cTrader for accuracy (handles restarts mid-day)
  await _fetchFromCTrader();
}

// Call this from the POSITION_STATUS_CLOSED ExecutionEvent handler in index.js
async function onPositionClose(deal) {
  _ensureToday();
  if (!deal?.closePositionDetail) return;

  const cpd = deal.closePositionDetail;
  const scale = Math.pow(10, cpd.moneyDigits ?? deal.moneyDigits ?? 2);
  const pnl = (Number(cpd.grossProfit || 0) + Number(cpd.swap || 0) + Number(cpd.commission || 0)) / scale;

  _state.realizedPnL = parseFloat((_state.realizedPnL + pnl).toFixed(2));
  logger.info('Daily realized P&L updated', {
    trade: parseFloat(pnl.toFixed(2)),
    total: _state.realizedPnL
  });

  // Track stop losses (trades that closed negative)
  if (pnl < 0) {
    _state.dailyStopLosses = (_state.dailyStopLosses || 0) + 1;
    logger.info('Daily stop loss count incremented', { dailyStopLosses: _state.dailyStopLosses });
  }

  // Check limit — only lock once
  if (!_state.tradingLocked) {
    const settings = _loadSettings();
    const limitPct = settings.dailyLossLimit;
    if (limitPct) {
      const balance = await _fetchBalance();
      const threshold = balance > 0 ? balance * (limitPct / 100) : 0;
      if (threshold > 0 && _state.realizedPnL < -threshold) {
        _state.tradingLocked = true;
        logger.warn('Daily loss limit breached — trading locked', {
          realizedPnL: _state.realizedPnL, limitPct, threshold: threshold.toFixed(2), balance
        });
        _sendLockAlert(limitPct, threshold);
      }
    }

    // Max daily loss in dollars
    const maxLossUSD = settings.maxDailyLossUSD;
    if (maxLossUSD != null && _state.realizedPnL < -Math.abs(maxLossUSD)) {
      _state.tradingLocked = true;
      logger.warn('Max daily dollar loss reached — trading locked', {
        realizedPnL: _state.realizedPnL, maxLossUSD
      });
      _sendDollarLockAlert(maxLossUSD);
    }

    // Max daily stop losses check
    const maxSL = settings.maxDailyStopLosses;
    if (maxSL != null && _state.dailyStopLosses >= maxSL) {
      _state.tradingLocked = true;
      logger.warn('Max daily stop losses reached — trading locked', {
        dailyStopLosses: _state.dailyStopLosses, maxSL
      });
      _sendStopLossLimitAlert(_state.dailyStopLosses, maxSL);
    }
  }

  _saveState();
}

function getRealizedPnL() {
  _ensureToday();
  return _state.realizedPnL;
}

function isLocked() {
  _ensureToday();
  return _state.tradingLocked;
}

function unlock() {
  _ensureToday();
  _state.tradingLocked = false;
  _saveState();
  logger.info('Trading unlocked (manual reset)', { realizedPnL: _state.realizedPnL });
}

function getDailyStopLosses() {
  _ensureToday();
  return _state.dailyStopLosses || 0;
}

module.exports = { init, onPositionClose, getRealizedPnL, isLocked, unlock, getDailyStopLosses };
