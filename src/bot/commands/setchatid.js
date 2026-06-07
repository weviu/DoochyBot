const { saveSettings } = require('../../storage');

async function setchatidCmd(ctx) {
  const chatId = ctx.chat.id;
  saveSettings({ chatId });
  await ctx.reply('Chat ID saved. Alerts will be sent here.');
}

module.exports = { setchatidCmd };
