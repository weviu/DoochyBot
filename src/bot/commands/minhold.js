const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      // /minhold — show current setting
      if (args.length === 0) {
        const secs = settings.minHoldSeconds ?? 0;
        const msg = secs > 0
          ? `⏱️ Minimum hold time: ${secs} seconds`
          : '⏱️ Minimum hold time: disabled';
        await ctx.reply(msg);
        return;
      }

      // /minhold <seconds>
      const secs = parseInt(args[0], 10);
      if (isNaN(secs) || secs < 0 || secs > 3600) {
        await ctx.reply('❌ Please provide a valid number of seconds (0–3600)\nExample: /minhold 60\nUse 0 to disable');
        return;
      }

      settings.minHoldSeconds = secs;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      if (secs === 0) {
        await ctx.reply('✅ Minimum hold time disabled');
      } else {
        await ctx.reply(`✅ Minimum hold time set to ${secs} seconds`);
      }

      logger.info('minHoldSeconds updated', { secs });
    } catch (err) {
      logger.error('minhold command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
