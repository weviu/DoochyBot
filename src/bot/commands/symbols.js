const state = require('../../state');
const { saveSettings } = require('../../storage');
const { SYMBOL_GROUPS, DEFAULT_LOT_SIZES } = require('../../config');

const GROUP_NAMES = Object.keys(SYMBOL_GROUPS);

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
    await ctx.reply(`Added ${added} new symbols (${allowed.size} total). Default lot size: ${DEFAULT_LOTS}.`);
    return;
  }

  if (sub === 'add') {
    const arg = (parts[1] || '').toLowerCase();
    if (GROUP_NAMES.includes(arg)) {
      const groupSymbols = SYMBOL_GROUPS[arg];
      const allowed = new Set(state.settings.allowedSymbols || []);
      const lotSizes = { ...state.settings.lotSizes };
      let added = 0;
      for (const sym of groupSymbols) {
        if (!allowed.has(sym)) {
          allowed.add(sym);
          added++;
        }
        if (lotSizes[sym] == null) {
          lotSizes[sym] = DEFAULT_LOT_SIZES[sym] ?? 0.1;
        }
      }
      state.settings.allowedSymbols = [...allowed];
      state.settings.lotSizes = lotSizes;
      saveSettings({ allowedSymbols: state.settings.allowedSymbols, lotSizes: state.settings.lotSizes });
      await ctx.reply(`Added ${added} new ${arg} symbols (${allowed.size} total).`);
      return;
    }

    const symbol = (parts[1] || '').toUpperCase();
    const lots = parseFloat(parts[2]);
    if (!symbol || isNaN(lots) || lots <= 0) {
      await ctx.reply('Usage: /symbols add <group|SYMBOL> [lots]\nGroups: crypto, indices, commodities');
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
    const arg = (parts[1] || '').toLowerCase();
    if (GROUP_NAMES.includes(arg)) {
      const groupSet = new Set(SYMBOL_GROUPS[arg]);
      const before = (state.settings.allowedSymbols || []).length;
      state.settings.allowedSymbols = (state.settings.allowedSymbols || []).filter(s => !groupSet.has(s));
      const lotSizes = { ...state.settings.lotSizes };
      for (const sym of groupSet) delete lotSizes[sym];
      state.settings.lotSizes = lotSizes;
      const removed = before - state.settings.allowedSymbols.length;
      saveSettings({ allowedSymbols: state.settings.allowedSymbols, lotSizes: state.settings.lotSizes });
      await ctx.reply(`Removed ${removed} ${arg} symbols (${state.settings.allowedSymbols.length} remaining).`);
      return;
    }

    const symbol = (parts[1] || '').toUpperCase();
    if (!symbol) {
      await ctx.reply('Usage: /symbols remove <group|SYMBOL>\nGroups: crypto, indices, commodities');
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

  await ctx.reply(
    'Usage: /symbols | /symbols add all | /symbols add <group|SYMBOL> [lots] | /symbols remove <group|SYMBOL>\n' +
    'Groups: crypto, indices, commodities'
  );
}

module.exports = { symbolsCmd };
