const fs = require('fs');
const path = require('path');

const TRADE_LOG_FILE = path.join(__dirname, '../state/tradeLog.json');

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadTradeLog() {
  try {
    if (fs.existsSync(TRADE_LOG_FILE)) {
      const data = fs.readFileSync(TRADE_LOG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load trade log:', err);
  }
  return [];
}

/**
 * Calculate today's total PnL from closed trades
 * Returns object: { dailyPnL: number, tradesCount: number }
 */
function getDailyPnL() {
  const today = getToday();
  const trades = loadTradeLog();
  
  let dailyPnL = 0;
  let count = 0;
  
  trades.forEach(trade => {
    const tradeDate = trade.closeTime ? trade.closeTime.split(' ')[0] : null;
    if (tradeDate === today && trade.pnl !== undefined) {
      dailyPnL += trade.pnl;
      count++;
    }
  });
  
  return { dailyPnL, count };
}

/**
 * Check if daily loss limit has been exceeded
 * dailyLossLimit is a negative number (e.g., -5 for 5% loss limit)
 */
function isDailyLossLimitExceeded(dailyLossLimitPercent) {
  const { dailyPnL } = getDailyPnL();
  // If dailyLossLimit is 5 (meaning max 5% loss), then dailyPnL should not go below -5
  // The dailyLossLimitPercent comes as positive (e.g., 5), so we negate it
  return dailyPnL < -dailyLossLimitPercent;
}

module.exports = {
  getDailyPnL,
  isDailyLossLimitExceeded
};
