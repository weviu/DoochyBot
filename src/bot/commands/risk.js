const state = require('../../state');
const { saveSettings } = require('../../storage');

const SLTP_DESCRIPTIONS = {
  auto: 'Uses signal SL/TP when available, falls back to dollar mode.',
  dollar: 'Calculates SL/TP from fixed USD amounts in settings.',
  pivot: 'Trusts signal SL/TP completely. Skips if not provided.',
};

async function riskCmd(ctx) {
  const parts = (ctx.message.text || '').trim().split(/\s+/).slice(1);
  const sub = parts[0];

  if (sub === 'daily') {
    const val = parseFloat(parts[1]);
    if (isNaN(val) || val <= 0) {
      await ctx.reply('Invalid percentage. Use a number like 2 or 1.5');
      return;
    }
    state.settings.dailyLossLimitPercent = val;
    saveSettings({ dailyLossLimitPercent: val });
    await ctx.reply(`Daily loss limit: ${val}%`);

  } else if (sub === 'size') {
    const symbol = (parts[1] || '').toUpperCase();
    const lots = parseFloat(parts[2]);
    if (!symbol || isNaN(lots) || lots <= 0) {
      await ctx.reply('Usage: /risk size <SYMBOL> <lots>');
      return;
    }
    state.settings.lotSizes = { ...state.settings.lotSizes, [symbol]: lots };
    saveSettings({ lotSizes: state.settings.lotSizes });
    await ctx.reply(`Lot size: ${symbol} = ${lots} lots`);

  } else if (sub === 'mode') {
    const mode = parts[1];
    if (mode !== 'fixed' && mode !== 'percent') {
      await ctx.reply('Usage: /risk mode <fixed|percent>');
      return;
    }
    state.settings.riskMode = mode;
    saveSettings({ riskMode: mode });
    const msg = mode === 'fixed' ? 'Sizing mode: fixed lots' : 'Sizing mode: percent of equity (SL required)';
    await ctx.reply(msg);

  } else if (sub === 'percent') {
    const val = parseFloat(parts[1]);
    if (isNaN(val) || val <= 0) {
      await ctx.reply('Invalid percentage. Use a number like 1 or 0.5');
      return;
    }
    state.settings.riskPercent = val;
    saveSettings({ riskPercent: val });
    await ctx.reply(`Risk per trade: ${val}%`);

  } else if (sub === 'sltp') {
    const mode = parts[1];
    if (!SLTP_DESCRIPTIONS[mode]) {
      await ctx.reply('Usage: /risk sltp <auto|dollar|pivot>');
      return;
    }
    state.settings.sltpMode = mode;
    saveSettings({ sltpMode: mode });
    await ctx.reply(`SL/TP mode: ${mode}\n${SLTP_DESCRIPTIONS[mode]}`);

  } else if (sub === 'minhold') {
    const val = parseInt(parts[1], 10);
    if (isNaN(val) || val < 0) {
      await ctx.reply('Invalid value. Use whole seconds like 60 or 0');
      return;
    }
    state.settings.minHoldSeconds = val;
    saveSettings({ minHoldSeconds: val });
    await ctx.reply(`Min hold time: ${val}s (TP delayed by this amount)`);

  } else {
    await ctx.reply('Usage: /risk <daily|size|mode|percent|sltp|minhold> ...');
  }
}

module.exports = { riskCmd };
