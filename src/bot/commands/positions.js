const logger = require('../../utils/logger');

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      const fetch = require('node-fetch');

      const response = await fetch(`${proxyUrl}/positions`);
      const result = await response.json();

      if (!result.success) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      const positions = result.data;

      if (positions.length === 0) {
        await ctx.reply('📭 No open positions');
        return;
      }

      let posText = '📍 Open Positions\n\n';
      positions.forEach((pos, idx) => {
        const pnl = pos.pnl >= 0 ? '📈' : '📉';
        posText +=
          `${idx + 1}. ${pos.direction} ${pos.volume} ${pos.symbol}\n` +
          `   @ ${pos.openPrice.toFixed(5)} | ${pnl} PnL: $${pos.pnl.toFixed(2)}\n` +
          `   SL: ${pos.sl || 'None'} | TP: ${pos.tp || 'None'}\n\n`;
      });

      await ctx.reply(posText);
      logger.info('Positions command executed', { count: positions.length });
    } catch (err) {
      logger.error('Positions command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
