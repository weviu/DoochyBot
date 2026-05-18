const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      // Save current chat ID to settings
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      settings.chatId = ctx.chat.id.toString();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      await ctx.reply('✅ Chat ID set. TradingView alerts will send confirmations here.');
      logger.info('Chat ID configured', { chatId: ctx.chat.id });
    } catch (err) {
      logger.error('Setchatid command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
