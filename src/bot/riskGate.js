const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { getDailyPnL, isDailyLossLimitExceeded } = require('../utils/pnl');

const SETTINGS_FILE = path.join(__dirname, '../state/settings.json');
const POSITIONS_FILE = path.join(__dirname, '../state/positions.json');
const TRADE_LOG_FILE = path.join(__dirname, '../state/tradeLog.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (err) {
    logger.error('Failed to load settings', { error: err.message });
  }
  return {};
}

function loadPositions() {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
    }
  } catch (err) {
    logger.error('Failed to load positions', { error: err.message });
  }
  return [];
}

function loadTradeLog() {
  try {
    if (fs.existsSync(TRADE_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(TRADE_LOG_FILE, 'utf-8'));
    }
  } catch (err) {
    logger.error('Failed to load trade log', { error: err.message });
  }
  return [];
}

/**
 * Run all risk checks before executing a trade
 * Returns: { passed: boolean, reason?: string }
 */
function checkRisks(signal, lastSignalTime = {}) {
  const settings = loadSettings();
  const positions = loadPositions();

  // Check 1: Is trading paused?
  if (settings.paused) {
    const reason = 'Trading is paused. Use /resume to enable.';
    logger.warn('Risk check failed: trading paused', { signal });
    return { passed: false, reason };
  }

  // Check 2: Is symbol in allowed list?
  if (!settings.allowedSymbols || !settings.allowedSymbols.includes(signal.symbol)) {
    const reason = `Symbol ${signal.symbol} not in allowed list`;
    logger.warn('Risk check failed: symbol not allowed', { signal });
    return { passed: false, reason };
  }

  // Check 3: Is it a weekday (not weekend)?
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const reason = 'Trading is closed on weekends';
    logger.warn('Risk check failed: weekend', { signal });
    return { passed: false, reason };
  }

  // Check 4: Is there an active news blackout?
  if (settings.blackoutTimes && settings.blackoutTimes.length > 0) {
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    for (const blackout of settings.blackoutTimes) {
      if (currentTime >= blackout.start && currentTime < blackout.end) {
        const reason = 'News blackout active';
        logger.warn('Risk check failed: news blackout', { signal });
        return { passed: false, reason };
      }
    }
  }

  // Check 5: Max open positions?
  if (positions.length >= settings.maxPositions) {
    const reason = `Max open positions (${settings.maxPositions}) reached`;
    logger.warn('Risk check failed: max positions', { signal, current: positions.length });
    return { passed: false, reason };
  }

  // Check 6: Max total exposure?
  const currentExposure = positions.reduce((sum, pos) => sum + pos.volume, 0);
  if (currentExposure + signal.volume > settings.maxTotalExposure) {
    const reason = `Max exposure (${settings.maxTotalExposure}) would be exceeded`;
    logger.warn('Risk check failed: max exposure', {
      signal,
      current: currentExposure,
      max: settings.maxTotalExposure
    });
    return { passed: false, reason };
  }

  // Check 7: Daily loss limit?
  if (isDailyLossLimitExceeded(settings.dailyLossLimit)) {
    const reason = `Daily loss limit (${settings.dailyLossLimit}%) reached`;
    logger.warn('Risk check failed: daily loss limit', { signal });
    return { passed: false, reason };
  }

  // Check 8: Duplicate signal (same symbol + direction in last 60 seconds)?
  const sixtySecondsAgo = Date.now() - 60000;
  const recentKey = `${signal.symbol}:${signal.direction}`;
  
  if (lastSignalTime[recentKey] && lastSignalTime[recentKey] > sixtySecondsAgo) {
    const reason = `Duplicate signal for ${signal.symbol} ${signal.direction}`;
    logger.warn('Risk check failed: duplicate signal', { signal });
    return { passed: false, reason };
  }

  logger.info('All risk checks passed', { signal });
  return { passed: true };
}

module.exports = {
  checkRisks,
  loadSettings,
  loadPositions,
  loadTradeLog
};
