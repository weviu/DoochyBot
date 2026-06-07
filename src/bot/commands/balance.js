const state = require('../../state');

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function balanceCmd(ctx) {
  const a = state.accountInfo;
  const text = [
    `Balance: $${fmt(a.balance)}`,
    `Equity: $${fmt(a.equity)}`,
    `Margin: $${fmt(a.margin)}`,
    `Free Margin: $${fmt(a.freeMargin)}`,
  ].join('\n');
  await ctx.reply(text);
}

module.exports = { balanceCmd };
