const logger = require('../../utils/logger');

module.exports = () => {
  return async (ctx) => {
    try {
      const setupText =
        `🔔 TradingView Integration Setup\n\n` +
        `Your Webhook URL:\n` +
        `└─ https://aprhunter.route07.com/webhook\n\n` +
        `Step 1: Register This Chat\n` +
        `├─ Send /setchatid\n` +
        `├─ Saves your chat for confirmations\n` +
        `└─ Check: cat settings.json\n\n` +
        `Step 2: Create Alert in TradingView\n` +
        `├─ Webhook URL: https://aprhunter.route07.com/webhook\n` +
        `├─ Message: BUY BTCUSD SL=65000 TP=67000\n` +
        `└─ Or use: {{strategy.order.alert_message}}\n\n` +
        `Signal Format: {DIRECTION} {SYMBOL} SL={PRICE} [TP={PRICE}]\n` +
        `├─ Examples:\n` +
        `│  • BUY BTCUSD SL=65000 TP=67000\n` +
        `│  • SELL XAUUSD SL=2050\n` +
        `│  • LONG EURUSD SL=1.0800\n` +
        `└─ Allowed: BTCUSD, XAUUSD, XAGUSD\n\n` +
        `Allowed Symbols: /symbols\n` +
        `Add Symbol: /symbols add ETHUSDT 0.1\n\n` +
        `Test Webhook:\n` +
        `curl -X POST https://aprhunter.route07.com/webhook \\` + '\n' +
        `  -H "Content-Type: text/plain" \\` + '\n' +
        `  -d "BUY BTCUSD SL=65000 TP=67000"\n\n` +
        `📚 Full Guide: See TRADINGVIEW-SETUP.md`;

      await ctx.reply(setupText);
      logger.info('TradingView setup info displayed');
    } catch (err) {
      logger.error('TradingView setup command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
