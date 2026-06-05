const logger = require('../../utils/logger');

module.exports = () => {
  return async (ctx) => {
    try {
      const helpText =
        ` --Available Commands-- \n\n` +
        `/status - Show trading status & account summary\n` +
        `/balance - Show account balance details\n` +
        `/positions - List all open positions\n\n` +
        `/pause - Pause trading (disable new signals)\n` +
        `/resume - Resume trading\n` +
        `/confirm on|off - Enable/disable signal confirmation (off = auto-execute)\n` +
        `/setchatid - Configure chat for TradingView webhook confirmations\n\n` +
        `/closeall - Close all open positions (with confirmation)\n\n` +
        `/risk - Risk management: loss limits, position sizing, exposure\n` +
        `/symbols - Manage allowed trading symbols and lot sizes\n` +
        `/tpsl - Configure SL/TP mode (pivot/dollar/auto) and dollar amounts\n` +
        `/profile - Switch or manage prop firm profiles\n` +
        `/weekend on|off - Enable or disable weekend trading\n\n` +
        `/minhold [seconds] - Show or set minimum position hold time (0 = off)\n\n` +
        `/pnl - Show today's realized + unrealized P&L\n` +
        `/pnl reset - Unlock trading after daily loss limit\n\n` +
        `/export - Export trade history as .txt file\n\n` +
        `/help - Show this help message\n\n` +
        `📊 Signal Format:\n` +
        `BUY BTCUSD SL=65000 TP=67000\n` +
        `SELL XAUUSD SL=2050\n\n`;

      await ctx.reply(helpText);
      logger.info('Help command executed');
    } catch (err) {
      logger.error('Help command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
