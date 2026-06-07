const state = require('../../state');

function fmtPnL(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

async function statusCmd(ctx) {
  const maxLoss = Math.min(
    state.accountInfo.balance * (state.settings.dailyLossLimitPercent / 100),
    state.settings.maxDailyLossUSD
  );

  let tradingState = 'ACTIVE';
  if (state.tradingLocked) tradingState = 'LOCKED (daily limit)';
  else if (state.paused) tradingState = 'PAUSED';

  const text = [
    'DoochyBot Status',
    `Daily P&L: ${fmtPnL(state.dailyRealizedPnL)} (limit: -$${maxLoss.toFixed(2)})`,
    `Open positions: ${state.positions.size}/${state.settings.maxPositions}`,
    `Trading: ${tradingState}`,
    `Mode: ${state.settings.riskMode} lots | SL/TP: ${state.settings.sltpMode}`,
  ].join('\n');

  await ctx.reply(text);
}

module.exports = { statusCmd };
