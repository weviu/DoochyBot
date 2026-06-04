const logger = require('../../utils/logger');
const { parseSignal } = require('../../bot/parser');
const { checkRisks, loadSettings } = require('../../bot/riskGate');
const { sendConfirmation, sendAlert, executeTradingViewTrade } = require('../../bot/confirm');

module.exports = (connection) => {
  return async (req, res) => {
    try {
      // req.body should be raw text string like "BUY BTCUSD SL=65000 TP=67000"
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
      const riskCheck = checkRisks(signal, {});
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
        // Auto-execute and send alert
        const result = await executeTradingViewTrade(signal);
        await sendAlert(signal, result);
        return res.json({
          success: result.success,
          message: result.success ? 'Signal auto-executed' : `Auto-execute failed: ${result.error}`,
          data: result.data
        });
      }

      // Send Telegram confirmation
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
