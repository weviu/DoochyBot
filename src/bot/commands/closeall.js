const { config } = require('../../config');
const state = require('../../state');
const { getConnection } = require('../../ctrader/orders');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function closeallCmd(ctx) {
  if (state.positions.size === 0) {
    await ctx.reply('No positions to close.');
    return;
  }

  const count = state.positions.size;
  await ctx.reply(`Closing ${count} position${count > 1 ? 's' : ''}...`);

  const connection = getConnection();
  let failed = 0;

  for (const [positionId, pos] of state.positions) {
    try {
      await connection.sendCommand('ProtoOAPositionCloseReq', {
        ctidTraderAccountId: config.ctrader.accountId,
        positionId,
        volume: Math.round(pos.volume * 100000),
      });
    } catch (err) {
      console.log(`[${ts()}] Failed to close position #${positionId}: ${err.message || JSON.stringify(err)}`);
      failed++;
    }
  }

  const closed = count - failed;
  let reply = `Closed ${closed} position${closed !== 1 ? 's' : ''}.`;
  if (failed > 0) reply += ` Failed: ${failed}`;
  await ctx.reply(reply);
}

module.exports = { closeallCmd };
