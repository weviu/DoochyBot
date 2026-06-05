const logger = require('../../utils/logger');

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      const fetch = require('node-fetch');

      const response = await fetch(`${proxyUrl}/balance`);
      const result = await response.json();

      if (!result.success) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      const data = result.data;
      const balanceText =
        `💰 Account Balance\n` +
        `Equity: $${(data.equity || 0).toFixed(2)}\n` +
        `Balance: $${(data.balance || 0).toFixed(2)}\n` +
        `Margin Used: $${(data.margin || 0).toFixed(2)}\n` +
        `Margin Level: ${(data.marginLevel || 0).toFixed(2)}%`;

      await ctx.reply(balanceText);
      logger.info('Balance command executed');
    } catch (err) {
      logger.error('Balance command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
