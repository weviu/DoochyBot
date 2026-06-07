const state = require('../../state');

async function positionsCmd(ctx) {
  if (state.positions.size === 0) {
    await ctx.reply('No open positions.');
    return;
  }

  const lines = [];
  for (const [positionId, pos] of state.positions) {
    let line = `${pos.direction} ${pos.volume} ${pos.symbol} @ ${pos.entryPrice}`;
    if (pos.sl != null) line += ` | SL: ${pos.sl}`;
    if (pos.tp != null) line += ` | TP: ${pos.tp}`;
    line += ` (#${positionId})`;
    lines.push(line);
  }

  await ctx.reply(lines.join('\n'));
}

module.exports = { positionsCmd };
