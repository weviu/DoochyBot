const logger = require('../../utils/logger');
const dailyPnL = require('../../proxy/dailyPnL');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);

      // /pnl reset — unlock trading after daily loss lock
      if (args[0]?.toLowerCase() === 'reset') {
        dailyPnL.unlock();
        await ctx.reply('✅ Daily loss lock cleared — trading re-enabled.');
        logger.info('Daily loss lock reset by user');
        return;
      }

      // /pnl — show today's P&L summary
      const fetch = require('node-fetch');
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      const limitPct = settings.dailyLossLimit || 0;
      const locked = dailyPnL.isLocked();
      const realized = dailyPnL.getRealizedPnL();

      // Fetch balance and unrealized in parallel
      const [balanceRes, posRes] = await Promise.allSettled([
        fetch(`${proxyUrl}/balance`).then(r => r.json()),
        fetch(`${proxyUrl}/positions`).then(r => r.json())
      ]);

      const balance = balanceRes.status === 'fulfilled' && balanceRes.value.success
        ? balanceRes.value.data.balance : null;

      let unrealized = 0;
      let openCount = 0;
      if (posRes.status === 'fulfilled' && posRes.value.success) {
        for (const pos of posRes.value.data) {
          if (pos.pnl != null) unrealized += pos.pnl;
        }
        openCount = posRes.value.data.length;
      }

      unrealized = parseFloat(unrealized.toFixed(2));
      const combined = parseFloat((realized + unrealized).toFixed(2));

      const fmt = (v) => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      let limitLine;
      if (limitPct > 0 && balance != null) {
        const threshold = parseFloat((balance * (limitPct / 100)).toFixed(2));
        const used = Math.abs(Math.min(realized, 0));
        const remaining = parseFloat((threshold - used).toFixed(2));
        limitLine = `Limit: ${limitPct}% ($${threshold.toFixed(2)}) | Remaining: ${remaining >= 0 ? `$${remaining.toFixed(2)}` : '⚠️ OVER'}`;
      } else if (limitPct > 0) {
        limitLine = `Limit: ${limitPct}% (balance unavailable)`;
      } else {
        limitLine = `Limit: not set`;
      }

      const statusLine = locked
        ? `🔒 Trading locked — /pnl reset to unlock`
        : `✅ Trading active`;

      const unrealizedLine = openCount > 0
        ? `Unrealized: ${fmt(unrealized)} (${openCount} open)`
        : `Unrealized: $0.00 (no open positions)`;

      await ctx.reply(
        `📊 Daily P&L — ${today}\n\n` +
        `Realized:   ${fmt(realized)}\n` +
        `${unrealizedLine}\n` +
        `Combined:   ${fmt(combined)}\n\n` +
        `${limitLine}\n` +
        `${statusLine}`
      );

      logger.info('pnl command executed', { realized, unrealized, combined, locked });
    } catch (err) {
      logger.error('pnl command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
