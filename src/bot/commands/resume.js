const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      settings.paused = false;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      await ctx.reply('▶ Trading resumed.');
      logger.info('Trading resumed');
    } catch (err) {
      logger.error('Resume command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
