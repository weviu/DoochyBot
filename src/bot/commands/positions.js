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
        const price = pos.openPrice != null ? pos.openPrice : 'N/A';
        const symbol = pos.symbol || `symbolId:${pos.symbolId}`;
        const pnlStr = pos.pnl != null
          ? `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`
          : 'N/A';
        posText +=
          `${idx + 1}. ${pos.direction} ${pos.volume} ${symbol}\n` +
          `   Entry: ${price} | P&L: ${pnlStr}\n` +
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
