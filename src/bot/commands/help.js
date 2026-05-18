const logger = require('../../utils/logger');

module.exports = () => {
  return async (ctx) => {
    try {
      const helpText =
        `📖 Available Commands\n\n` +
        `/status - Show trading status & account summary\n` +
        `/balance - Show account balance details\n` +
        `/positions - List all open positions\n\n` +
        `/pause - Pause trading (disable new signals)\n` +
        `/resume - Resume trading\n` +
        `/setchatid - Configure chat for TradingView webhook confirmations\n` +
        `/tv - TradingView webhook setup instructions\n\n` +
        `/closeall - Close all open positions (with confirmation)\n\n` +
        `/risk daily <percent> - Set daily loss limit\n` +
        `/risk size <symbol> <volume> - Set lot size for a symbol\n\n` +
        `/symbols - List allowed symbols\n` +
        `/symbols add <symbol> <volume> - Add new symbol\n` +
        `/symbols remove <symbol> - Remove symbol\n\n` +
        `/help - Show this help message\n\n` +
        `📊 Signal Format:\n` +
        `BUY BTCUSD SL=65000 TP=67000\n` +
        `SELL XAUUSD SL=2050\n\n` +
        `📚 For TradingView setup: /tv`;

      await ctx.reply(helpText);
      logger.info('Help command executed');
    } catch (err) {
      logger.error('Help command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
