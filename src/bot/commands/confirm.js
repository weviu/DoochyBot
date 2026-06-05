const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      if (args.length < 1) {
        const current = settings.requireConfirmation !== false ? 'on' : 'off';
        await ctx.reply(`Confirmation is currently ${current}.\nUsage: /confirm on|off`);
        return;
      }

      const arg = args[0].toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await ctx.reply('Usage: /confirm on|off');
        return;
      }

      const enable = arg === 'on';
      settings.requireConfirmation = enable;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      await ctx.reply(enable
        ? '✅ Confirmation enabled — signals will require approval before executing'
        : '⚡️ Confirmation disabled. signals will auto execute'
      );
      logger.info('Confirmation setting updated', { requireConfirmation: enable });
    } catch (err) {
      logger.error('Confirm command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
