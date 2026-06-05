const logger = require('../../utils/logger');
const { parseSignal } = require('../../bot/parser');
const { checkRisks, loadSettings, loadPositions, loadTradeLog } = require('../../bot/riskGate');
const { sendConfirmation, sendAlert, sendReversalAlert, sendReversalRejected, executeTradingViewTrade } = require('../../bot/confirm');
const { checkReversal } = require('../../bot/reversalGuard');
const fetch = require('node-fetch');

module.exports = (connection) => {
  return async (req, res) => {
    try {
      const rawSignal = req.body;

      if (!rawSignal || typeof rawSignal !== 'string') {
        logger.warn('Webhook received invalid body', { body: req.body });
        return res.status(400).json({
          success: false,
          error: 'Invalid signal format. Body must be plain text.'
        });
      }

      logger.info('Webhook received signal', { rawSignal });

      // Parse the signal
      let signal;
      try {
        const settings = loadSettings();
        signal = parseSignal(rawSignal, settings.symbolLotSizes);
      } catch (err) {
        logger.warn('Webhook signal parse failed', { rawSignal, error: err.message });
        return res.status(400).json({
          success: false,
          error: `Invalid signal format: ${err.message}`
        });
      }

      logger.info('Webhook signal parsed', signal);

      // Run risk gate
      const riskCheck = await checkRisks(signal, {});
      if (!riskCheck.passed) {
        logger.warn('Webhook signal rejected by risk gate', { signal, reason: riskCheck.reason });
        return res.status(403).json({
          success: false,
          reason: riskCheck.reason
        });
      }

      logger.info('Webhook signal passed risk checks', signal);

      const settings = loadSettings();

      if (settings.requireConfirmation === false) {
        // ── Reversal detection ─────────────────────────────────────────────
        const openPositions = loadPositions();
        const conflicting = openPositions.filter(
          p => p.symbol === signal.symbol && p.direction !== signal.direction
        );

        if (conflicting.length > 0) {
          const tradeHistory = loadTradeLog();

          // Enrich the first conflicting position with openTime from tradeLog
          const firstConflict = conflicting[0];
          const logEntry = tradeHistory.find(e => String(e.positionId) === String(firstConflict.positionId));
          const enrichedPosition = { ...firstConflict, openTime: logEntry ? logEntry.openTime : null };

          const reversalCheck = checkReversal(enrichedPosition, signal, tradeHistory);

          if (!reversalCheck.allowed) {
            logger.warn('Reversal rejected', { symbol: signal.symbol, reason: reversalCheck.reason });
            await sendReversalRejected(signal, reversalCheck.reason);
            return res.status(403).json({ success: false, reason: reversalCheck.reason });
          }

          // Reversal approved — close all conflicting positions
          logger.info('Reversal approved', {
            symbol: signal.symbol,
            closing: conflicting.map(p => p.positionId)
          });

          for (const pos of conflicting) {
            try {
              const closeRes = await fetch(`http://localhost:9009/close/${pos.positionId}`, {
                method: 'POST'
              });
              const closeData = await closeRes.json();
              if (!closeData.success) {
                logger.warn('Close failed during reversal', {
                  positionId: pos.positionId,
                  error: closeData.error
                });
              } else {
                logger.info('Closed position for reversal', { positionId: pos.positionId });
              }
            } catch (closeErr) {
              logger.error('Error closing position during reversal', {
                positionId: pos.positionId,
                error: closeErr.message
              });
            }
          }

          // Let the close settle before opening the new position
          await new Promise(r => setTimeout(r, 1000));

          // Execute the new trade with reversal metadata
          const reversalMeta = {
            type: 'reversal',
            closedPositionId: conflicting[0].positionId,
            reversalReason: 'Stronger opposite signal'
          };

          const result = await executeTradingViewTrade(signal, reversalMeta);
          await sendReversalAlert(signal, conflicting, result);

          return res.json({
            success: result.success,
            message: result.success ? 'Reversal executed' : `Reversal failed: ${result.error}`,
            data: result.data
          });
        }

        // ── Normal auto-execute (no conflicting position) ─────────────────
        const result = await executeTradingViewTrade(signal);
        await sendAlert(signal, result);
        return res.json({
          success: result.success,
          message: result.success ? 'Signal auto-executed' : `Auto-execute failed: ${result.error}`,
          data: result.data
        });
      }

      // ── Manual confirmation flow ───────────────────────────────────────────
      try {
        await sendConfirmation(signal);

        res.json({
          success: true,
          message: 'Signal passed risk checks. Awaiting user confirmation in Telegram.'
        });
      } catch (err) {
        logger.error('Failed to send Telegram confirmation', { error: err.message });
        return res.status(500).json({
          success: false,
          error: 'Signal passed risk checks but failed to send confirmation. Check chatId.'
        });
      }
    } catch (err) {
      logger.error('Webhook error', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  };
};
