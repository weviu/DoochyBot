const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');
const PROFILES_FILE = path.join(__dirname, '../../state/profiles.json');

function syncToActiveProfile(settings, fields) {
  const active = settings.activeProfile;
  if (!active || active === 'custom') return;
  try {
    const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
    if (profiles[active]) {
      Object.assign(profiles[active], fields);
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
    }
  } catch (err) {
    logger.warn('Could not sync setting to active profile', { error: err.message });
  }
}

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);

      const noArgCmds = ['apply', 'mode', 'percent', 'maxsl', 'max'];
      if (args.length < 1 || (args.length < 2 && !noArgCmds.includes(args[0]?.toLowerCase()))) {
        await ctx.reply(
          `Usage:\n` +
          `/risk daily <percent> - Set daily loss limit %\n` +
          `/risk max <amount|off> - Set max daily loss in dollars\n` +
          `/risk maxsl <n|off> - Max losing trades per day before lock\n` +
          `/risk positions <number> - Set max open positions (1-50)\n` +
          `/risk size <symbol> <volume> - Set fixed lot size for symbol\n` +
          `/risk mode <fixed|percent> - Switch sizing mode\n` +
          `/risk percent <value> - Set risk % per trade (percent mode)\n` +
          `/risk apply - Apply current dollar TP/SL to all open positions\n\n` +
          `To set dollar SL/TP amounts use /tpsl usd sl and /tpsl usd tp`
        );
        return;
      }

      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      if (args[0].toLowerCase() === 'max') {
        const val = args[1]?.toLowerCase();
        if (!val) {
          const current = settings.maxDailyLossUSD;
          await ctx.reply(current != null
            ? `Max daily loss: $${Math.abs(current)}\nUse /risk max <amount> to change or /risk max off to disable.`
            : `Max daily loss: disabled\nUse /risk max <amount> to enable (e.g. /risk max 200).`
          );
          return;
        }
        if (val === 'off' || val === '0') {
          settings.maxDailyLossUSD = null;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply('Max daily dollar loss disabled.');
        } else {
          const amount = parseFloat(val);
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Usage: /risk max <amount> or /risk max off');
            return;
          }
          settings.maxDailyLossUSD = amount;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`✅ Max daily loss set to $${amount}. Trading will lock when realized P&L hits -$${amount}.`);
          logger.info('maxDailyLossUSD updated', { amount });
        }
      } else if (args[0].toLowerCase() === 'maxsl') {
        const val = args[1]?.toLowerCase();
        if (!val) {
          const current = settings.maxDailyStopLosses;
          await ctx.reply(current != null
            ? `Max daily stop losses: ${current}\nUse /risk maxsl <n> to change or /risk maxsl off to disable.`
            : `Max daily stop losses: disabled\nUse /risk maxsl <n> to enable.`
          );
          return;
        }
        if (val === 'off' || val === '0') {
          settings.maxDailyStopLosses = null;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply('Max daily stop losses disabled.');
        } else {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) {
            await ctx.reply('❌ Usage: /risk maxsl <number> or /risk maxsl off');
            return;
          }
          settings.maxDailyStopLosses = n;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`✅ Max daily stop losses set to ${n}. Trading will lock after ${n} losing trade${n > 1 ? 's' : ''} in a day.`);
          logger.info('maxDailyStopLosses updated', { n });
        }
      } else if (args[0].toLowerCase() === 'daily') {
        const percent = parseFloat(args[1]);
        if (isNaN(percent) || percent <= 0) {
          await ctx.reply('❌ Invalid percentage');
          return;
        }
        settings.dailyLossLimit = percent;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        syncToActiveProfile(settings, { dailyLossLimit: percent });
        await ctx.reply(`Daily loss limit set to ${percent}%`);
        logger.info('Daily loss limit updated', { percent });
      } else if (args[0].toLowerCase() === 'positions') {
        if (args.length < 2) {
          await ctx.reply('Usage: /risk positions <number>');
          return;
        }
        const number = parseInt(args[1], 10);
        if (isNaN(number) || number < 1 || number > 50) {
          await ctx.reply('Please provide a number between 1 and 50');
          return;
        }
        settings.maxPositions = number;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        await ctx.reply(`Max positions set to ${number}`);
        logger.info('Max positions updated', { number });
      } else if (args[0].toLowerCase() === 'size') {
        const symbol = args[1].toUpperCase();
        const volume = parseFloat(args[2]);
        if (isNaN(volume) || volume <= 0) {
          await ctx.reply('❌ Invalid volume');
          return;
        }
        settings.symbolLotSizes[symbol] = volume;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        await ctx.reply(`Lot size for ${symbol} set to ${volume}`);
        logger.info('Lot size updated', { symbol, volume });
      } else if (args[0].toLowerCase() === 'mode') {
        const mode = args[1]?.toLowerCase();
        if (!['fixed', 'percent'].includes(mode)) {
          await ctx.reply('❌ Usage: /risk mode <fixed|percent>');
          return;
        }
        settings.riskMode = mode;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        if (mode === 'percent') {
          const pct = settings.riskPercent ?? 1.0;
          await ctx.reply(`✅ Sizing mode: percent — risking ${pct}% equity per trade\nSL must be present in signal for this to work.`);
        } else {
          await ctx.reply(`✅ Sizing mode: fixed — using lot sizes from /risk size`);
        }
        logger.info('riskMode updated', { mode });
      } else if (args[0].toLowerCase() === 'percent') {
        if (args.length < 2) {
          const current = settings.riskPercent ?? 1.0;
          await ctx.reply(`Risk per trade: ${current}%\nUsage: /risk percent <value>  (e.g. 1.0)`);
          return;
        }
        const pct = parseFloat(args[1]);
        if (isNaN(pct) || pct <= 0 || pct > 10) {
          await ctx.reply('❌ Risk percent must be between 0.01 and 10');
          return;
        }
        settings.riskPercent = pct;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        syncToActiveProfile(settings, { riskPercent: pct });
        await ctx.reply(`✅ Risk per trade set to ${pct}%`);
        logger.info('riskPercent updated', { pct });
      } else if (args[0].toLowerCase() === 'apply') {
        const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        if (!currentSettings.takeProfitUSD && !currentSettings.stopLossUSD) {
          await ctx.reply('❌ No dollar targets configured. Use /risk tp and /risk sl first.');
          return;
        }

        await ctx.reply('⏳ Applying dollar targets to open positions...');

        const { applyDollarTargets } = require('../../proxy/syncPositions');
        const summary = await applyDollarTargets();

        if (summary.applied === 0 && summary.skipped > 0) {
          await ctx.reply(`✅ All ${summary.skipped} open positions already have TP/SL set.`);
          return;
        }

        if (summary.applied === 0) {
          await ctx.reply('ℹ️ No positions to update (no open positions or no local data).');
          return;
        }

        const lines = summary.results
          .filter(r => r.success)
          .map(r => {
            const tp = r.newTP != null ? `TP: ${r.newTP}` : '';
            const sl = r.newSL != null ? `SL: ${r.newSL}` : '';
            return `✅ ${r.symbol} #${r.positionId} ${[tp, sl].filter(Boolean).join(' | ')}`;
          });

        await ctx.reply(
          `Applied dollar targets to ${summary.applied} position(s):\n${lines.join('\n')}`
        );
        logger.info('Risk apply complete', summary);
      }
    } catch (err) {
      logger.error('Risk command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
