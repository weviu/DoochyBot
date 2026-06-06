'use strict';

const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { checkRisks, loadSettings, loadPositions, loadTradeLog } = require('../bot/riskGate');
const { checkReversal } = require('../bot/reversalGuard');
const {
  sendConfirmation, sendAlert,
  sendReversalAlert, sendReversalRejected,
  executeTradingViewTrade,
} = require('../bot/confirm');

let pollInterval    = null;
let lastSeenTs      = null;   // Date — baseline set on first poll
let firstPoll       = true;
let isPolling       = false;  // prevent concurrent poll executions
let unreachableFlag = false;  // suppress repeated "unreachable" log spam

// ── Symbol conversion ─────────────────────────────────────────────────────────
// Feed uses full names; cTrader uses broker-specific abbreviations for some.
// "BTC/USDT" → "BTCUSD"   "AAVE/USDT" → "AAVUSD"   "AVAX/USDT" → "AVAUSD"

const FEED_ALIASES = {
  'AAVE': 'AAVUSD',   // feed: AAVE  → cTrader: AAVUSD
  'ALGO': 'ALGUSD',   // feed: ALGO  → cTrader: ALGUSD
  'AVAX': 'AVAUSD',   // feed: AVAX  → cTrader: AVAUSD
  'LINK': 'LNKUSD',   // feed: LINK  → cTrader: LNKUSD
  'NEAR': 'NERUSD',   // feed: NEAR  → cTrader: NERUSD
};

function convertSymbol(raw) {
  const base = raw.split('/')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FEED_ALIASES[base] || (base + 'USD');
}

function parseTs(ts) {
  return new Date(ts.replace(' ', 'T') + 'Z');
}

// ── Signal processing ─────────────────────────────────────────────────────────

async function processAlert(alert) {
  const symbol    = convertSymbol(alert.symbol);
  const direction = alert.direction.toUpperCase();

  const settings = loadSettings();
  const volume   = settings.symbolLotSizes[symbol];

  if (!volume) {
    logger.info(`Feed signal rejected: ${direction} ${symbol} — symbol not configured`);
    return;
  }

  const signal = { direction, symbol, sl: null, tp: null, volume };

  const riskCheck = await checkRisks(signal, {});
  if (!riskCheck.passed) {
    logger.info(`Feed signal rejected: ${direction} ${symbol} — ${riskCheck.reason}`);
    return;
  }

  logger.info(`Feed signal: ${direction} ${symbol}`);

  if (settings.requireConfirmation === false) {
    // ── Reversal detection ──────────────────────────────────────────────────
    const openPositions = loadPositions();
    const conflicting   = openPositions.filter(
      p => p.symbol === signal.symbol && p.direction !== signal.direction
    );

    if (conflicting.length > 0) {
      const tradeHistory     = loadTradeLog();
      const firstConflict    = conflicting[0];
      const logEntry         = tradeHistory.find(e => String(e.positionId) === String(firstConflict.positionId));
      const enrichedPosition = { ...firstConflict, openTime: logEntry?.openTime ?? null };

      const reversalCheck = checkReversal(enrichedPosition, signal, tradeHistory);
      if (!reversalCheck.allowed) {
        logger.info(`Feed signal rejected: reversal blocked — ${reversalCheck.reason}`);
        await sendReversalRejected(signal, reversalCheck.reason);
        return;
      }

      for (const pos of conflicting) {
        try {
          await fetch(`http://localhost:9009/close/${pos.positionId}`, { method: 'POST' });
        } catch (err) {
          logger.warn('Feed: close failed during reversal', { positionId: pos.positionId, error: err.message });
        }
      }
      await new Promise(r => setTimeout(r, 1000));

      const result = await executeTradingViewTrade(signal, {
        type: 'reversal',
        closedPositionId: conflicting[0].positionId,
        reversalReason: 'Stronger opposite signal',
      });
      await sendReversalAlert(signal, conflicting, result);
      return;
    }

    // ── Normal auto-execute ─────────────────────────────────────────────────
    const result = await executeTradingViewTrade(signal);
    await sendAlert(signal, result);
    return;
  }

  // ── Confirmation flow ───────────────────────────────────────────────────────
  await sendConfirmation(signal);
}

// ── Poll cycle ────────────────────────────────────────────────────────────────

async function poll(url) {
  // Skip this tick if the previous poll is still processing
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await fetch(url, { timeout: 8000 });

    if (!res.ok) {
      if (!unreachableFlag) {
        logger.warn(`Signal feed unreachable: HTTP ${res.status}`);
        unreachableFlag = true;
      }
      return;
    }

    const alerts = await res.json();
    unreachableFlag = false;

    if (!Array.isArray(alerts) || alerts.length === 0) return;

    // ── Cold start: record baseline, process nothing ─────────────────────────
    if (firstPoll) {
      firstPoll = false;
      const dates = alerts.map(a => parseTs(a.timestamp));
      lastSeenTs  = new Date(Math.max(...dates));
      logger.info('Signal feed connected. Monitoring for new signals.');
      return;
    }

    // ── Find new alerts (after baseline) ────────────────────────────────────
    const newAlerts = alerts
      .filter(a => parseTs(a.timestamp) > lastSeenTs)
      .sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp));

    if (newAlerts.length === 0) return;

    // Advance the cursor BEFORE processing so concurrent ticks don't re-run the same batch
    lastSeenTs = parseTs(newAlerts[newAlerts.length - 1].timestamp);

    logger.info(`Poll: ${newAlerts.length} new signal${newAlerts.length > 1 ? 's' : ''} found`);

    for (const alert of newAlerts) {
      try {
        await processAlert(alert);
      } catch (err) {
        logger.warn('Feed signal processing error', { symbol: alert.symbol, error: err.message });
      }
    }

  } catch (err) {
    if (!unreachableFlag) {
      logger.warn(`Signal feed unreachable: ${err.message}`);
      unreachableFlag = true;
    }
  } finally {
    isPolling = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function start(url) {
  if (pollInterval) return;
  poll(url);
  pollInterval = setInterval(() => poll(url), 10000);
}

function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

module.exports = { start, stop };
