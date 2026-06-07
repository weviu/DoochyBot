const state = require('../../state');

async function resumeCmd(ctx) {
  state.paused = false;
  await ctx.reply('Trading resumed.');
}

module.exports = { resumeCmd };
