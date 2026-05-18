const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      settings.paused = true;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      await ctx.reply('⏸ Trading paused. Use /resume to re-enable.');
      logger.info('Trading paused');
    } catch (err) {
      logger.error('Pause command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
