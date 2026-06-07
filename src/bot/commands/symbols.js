const state = require('../../state');
const { saveSettings } = require('../../storage');

async function symbolsCmd(ctx) {
  const parts = (ctx.message.text || '').trim().split(/\s+/).slice(1);
  const sub = parts[0];

  if (!sub) {
    const allowed = state.settings.allowedSymbols || [];
    if (allowed.length === 0) {
      await ctx.reply('No symbols configured.');
      return;
    }
    const lines = allowed.map(sym => {
      const lots = state.settings.lotSizes[sym] ?? 'default';
      return `${sym}: ${lots}`;
    });
    await ctx.reply(lines.join(' | '));
    return;
  }

  if (sub === 'add') {
    const symbol = (parts[1] || '').toUpperCase();
    const lots = parseFloat(parts[2]);
    if (!symbol || isNaN(lots) || lots <= 0) {
      await ctx.reply('Usage: /symbols add <SYMBOL> <lots>');
      return;
    }
    const allowed = state.settings.allowedSymbols || [];
    if (!allowed.includes(symbol)) {
      state.settings.allowedSymbols = [...allowed, symbol];
    }
    state.settings.lotSizes = { ...state.settings.lotSizes, [symbol]: lots };
    saveSettings({ allowedSymbols: state.settings.allowedSymbols, lotSizes: state.settings.lotSizes });
    await ctx.reply(`Added ${symbol} (${lots} lots)`);
    return;
  }

  if (sub === 'remove') {
    const symbol = (parts[1] || '').toUpperCase();
    if (!symbol) {
      await ctx.reply('Usage: /symbols remove <SYMBOL>');
      return;
    }
    state.settings.allowedSymbols = (state.settings.allowedSymbols || []).filter(s => s !== symbol);
    const lotSizes = { ...state.settings.lotSizes };
    delete lotSizes[symbol];
    state.settings.lotSizes = lotSizes;
    saveSettings({ allowedSymbols: state.settings.allowedSymbols, lotSizes: state.settings.lotSizes });
    await ctx.reply(`Removed ${symbol}`);
    return;
  }

  await ctx.reply('Usage: /symbols | /symbols add <SYMBOL> <lots> | /symbols remove <SYMBOL>');
}

module.exports = { symbolsCmd };
