const logger = require('../../utils/logger');
const { InlineKeyboard } = require('grammy');

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      // Ask for confirmation
      const keyboard = new InlineKeyboard()
        .text('✅ Yes', 'confirm_closeall')
        .text('❌ No', 'cancel_closeall')
        .row();

      await ctx.reply(
        '⚠ Close ALL positions?',
        { reply_markup: keyboard }
      );
    } catch (err) {
      logger.error('Closeall command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
