const logger = require('../utils/logger');

function confluenceScore(direction, rsi, pivotLevel) {
  let score = 0;

  if (rsi != null) {
    if (direction === 'BUY' && rsi >= 35 && rsi <= 45) score += 2;
    if (direction === 'SELL' && rsi >= 55 && rsi <= 65) score += 2;
  }

  if (pivotLevel) {
    const pivot = pivotLevel.toUpperCase();
    if (['S2', 'S3', 'R2', 'R3'].includes(pivot)) score += 2;
    else if (['S1', 'R1'].includes(pivot)) score += 1;
  }

  return score;
}

/**
 * Decide whether a reversal trade is safe to execute.
 *
 * @param {object} existingPosition  — entry from positions.json, enriched with openTime from tradeLog
 * @param {object} newSignal         — parsed signal (direction, symbol, rsi?, pivot_level?)
 * @param {Array}  tradeHistory      — full tradeLog.json array
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkReversal(existingPosition, newSignal, tradeHistory) {
  // ── Check 2: Cooldown ──────────────────────────────────────────────────────
  const rawTime = existingPosition.openTime;
  if (rawTime != null) {
    let openMs;
    if (typeof rawTime === 'number') {
      openMs = rawTime; // Unix ms from cTrader
    } else if (typeof rawTime === 'string') {
      openMs = new Date(rawTime.replace(' ', 'T')).getTime();
    }

    if (openMs && !isNaN(openMs)) {
      const ageMs = Date.now() - openMs;
      if (ageMs < 300000) {
        return {
          allowed: false,
          reason: 'Position opened less than 5 minutes ago. Wait before reversing.'
        };
      }
    }
  }

  // ── Check 3: Daily reversal limit ─────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
  const todayReversals = tradeHistory.filter(entry => {
    if (entry.type !== 'reversal') return false;
    const entryDate = typeof entry.openTime === 'string'
      ? entry.openTime.substring(0, 10).replace('T', '-')
      : null;
    return entryDate === todayStr;
  });

  if (todayReversals.length >= 5) {
    return {
      allowed: false,
      reason: 'Daily reversal limit (5) reached. Manual intervention required.'
    };
  }

  // ── Check 1: Confluence score ──────────────────────────────────────────────
  // Skip entirely if the new signal carries no indicator data.
  const hasNewData = newSignal.rsi != null || newSignal.pivot_level != null;
  if (hasNewData) {
    const newScore = confluenceScore(newSignal.direction, newSignal.rsi, newSignal.pivot_level);

    // Find the most recent original entry for this symbol+direction in tradeLog
    const originalEntry = [...tradeHistory]
      .reverse()
      .find(entry =>
        entry.symbol === existingPosition.symbol &&
        entry.direction === existingPosition.direction &&
        entry.type !== 'reversal'
      );

    if (originalEntry && (originalEntry.rsi != null || originalEntry.pivot_level != null)) {
      const originalScore = confluenceScore(
        originalEntry.direction,
        originalEntry.rsi,
        originalEntry.pivot_level
      );

      if (newScore <= originalScore) {
        return {
          allowed: false,
          reason: `New signal score (${newScore}) must exceed original entry score (${originalScore})`
        };
      }
    }
    // No RSI/pivot in original entry → skip Check 1
  }
  // No RSI/pivot in new signal → skip Check 1

  logger.info('Reversal checks passed', {
    symbol: existingPosition.symbol,
    closing: existingPosition.direction,
    opening: newSignal.direction
  });

  return { allowed: true };
}

module.exports = { checkReversal };
