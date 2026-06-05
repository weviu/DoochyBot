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
        `/setchatid - Configure chat for TradingView webhook confirmations\n` +
        `/tv - TradingView webhook setup instructions\n\n` +
        `/closeall - Close all open positions (with confirmation)\n\n` +
        `/risk daily <percent> - Set daily loss limit\n` +
        `/risk size <symbol> <volume> - Set lot size for a symbol\n` +
        `/risk positions <number> - Set max open positions (1-50)\n` +
        `/risk apply - Apply current dollar TP/SL to all open positions\n\n` +
        `/symbols - List allowed symbols\n` +
        `/symbols add <symbol> <volume> - Add new symbol\n` +
        `/symbols remove <symbol> - Remove symbol\n\n` +
        `/tpsl - Show SL/TP mode & current values\n` +
        `/tpsl mode <pivot|dollar|auto> - Set mode\n` +
        `/tpsl sl <percent> - Pivot SL buffer % (0.05–5.0)\n` +
        `/tpsl tp <percent> - Pivot TP buffer % (0.05–5.0)\n` +
        `/tpsl usd sl <amount> - Dollar SL amount\n` +
        `/tpsl usd tp <amount> - Dollar TP amount\n\n` +
        `/export - Export trade history as .txt (last 7 days)\n` +
        `/export 2026-06-01 - Export from date\n` +
        `/export 2026-06-01 2026-06-05 - Export date range\n` +
        `/export 2026-06-01_12:00 2026-06-05_23:59 - With time\n\n` +
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
