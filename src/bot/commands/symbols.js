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

  if (sub === 'add' && (parts[1] || '').toUpperCase() === 'ALL') {
    if (state.symbolMap.size === 0) {
      await ctx.reply('Symbol map is empty - bot may still be starting up.');
      return;
    }
    const DEFAULT_LOTS = 0.01;
    const allowed = new Set(state.settings.allowedSymbols || []);
    const lotSizes = { ...state.settings.lotSizes };
    let added = 0;
    for (const name of state.symbolMap.keys()) {
      if (!allowed.has(name)) {
        allowed.add(name);
        added++;
      }
      if (lotSizes[name] == null) {
        lotSizes[name] = DEFAULT_LOTS;
      }
    }
    state.settings.allowedSymbols = [...allowed];
    state.settings.lotSizes = lotSizes;
    saveSettings({ allowedSymbols: state.settings.allowedSymbols, lotSizes: state.settings.lotSizes });
    await ctx.reply(`Added ${added} new symbols (${allowed.size} total). Default lot size: ${DEFAULT_LOTS}. Use /risk size <SYMBOL> <lots> to adjust.`);
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

  await ctx.reply('Usage: /symbols | /symbols add all | /symbols add <SYMBOL> <lots> | /symbols remove <SYMBOL>');
}

module.exports = { symbolsCmd };
