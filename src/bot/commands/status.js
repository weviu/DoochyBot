const logger = require('../../utils/logger');

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      const fetch = require('node-fetch');

      // Get health status
      const healthRes = await fetch(`${proxyUrl}/health`);
      const health = await healthRes.json();

      // Get positions
      const posRes = await fetch(`${proxyUrl}/positions`);
      const positions = await posRes.json();

      const posCount = positions.success ? positions.data.length : 0;

      // Get daily PnL
      const { getDailyPnL } = require('../../utils/pnl');
      const { dailyPnL } = getDailyPnL();

      // Get settings for pause status
      const fs = require('fs');
      const path = require('path');
      const settings = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../state/settings.json'), 'utf-8')
      );

      const statusText =
        `📊 Status\n` +
        `Connection: ${health.data.status === 'connected' ? '✅ Connected' : '❌ Disconnected'}\n` +
        `Account: ${health.data.accountId}\n` +
        `Open Positions: ${posCount}\n` +
        `Daily PnL: ${dailyPnL > 0 ? '📈' : '📉'} ${dailyPnL.toFixed(2)}%\n` +
        `Trading: ${settings.paused ? '⏸ Paused' : '▶ Active'}`;

      await ctx.reply(statusText);
      logger.info('Status command executed');
    } catch (err) {
      logger.error('Status command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
