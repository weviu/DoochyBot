const state = require('../../state');

async function pauseCmd(ctx) {
  state.paused = true;
  await ctx.reply('Trading paused. Use /resume to re-enable.');
}

module.exports = { pauseCmd };
