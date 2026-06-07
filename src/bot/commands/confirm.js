const state = require('../../state');
const { saveSettings } = require('../../storage');

async function confirmCmd(ctx) {
  const parts = (ctx.message.text || '').trim().split(/\s+/);
  const val = parts[1];

  if (val === 'on') {
    state.settings.confirmMode = true;
    saveSettings({ confirmMode: true });
    await ctx.reply('Confirmation mode ON - signals require approval before execution');
  } else if (val === 'off') {
    state.settings.confirmMode = false;
    saveSettings({ confirmMode: false });
    await ctx.reply('Confirmation mode OFF - signals execute automatically');
  } else {
    await ctx.reply('Usage: /confirm <on|off>');
  }
}

module.exports = { confirmCmd };
