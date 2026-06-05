const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);

      if (args.length < 1 || (args.length < 2 && args[0].toLowerCase() !== 'apply')) {
        await ctx.reply(
          `Usage:\n` +
          `/risk daily <percent>  - Set daily loss limit\n` +
          `/risk size <symbol> <volume> - Set lot size for symbol\n` +
          `/risk positions <number> - Set max open positions (1-50)\n` +
          `/risk tp <amount|off> - Set profit target in USD per deal\n` +
          `/risk sl <amount|off> - Set loss limit in USD per deal\n` +
          `/risk apply - Apply current TP/SL targets to all open positions`
        );
        return;
      }

      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      if (args[0].toLowerCase() === 'daily') {
        const percent = parseFloat(args[1]);
        if (isNaN(percent) || percent <= 0) {
          await ctx.reply('❌ Invalid percentage');
          return;
        }
        settings.dailyLossLimit = percent;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        await ctx.reply(`📊 Daily loss limit set to ${percent}%`);
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
      } else if (args[0].toLowerCase() === 'tp') {
        if (args[1].toLowerCase() === 'off') {
          settings.takeProfitUSD = null;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply('📊 Take profit target disabled');
          logger.info('Take profit target disabled');
        } else {
          const amount = parseFloat(args[1]);
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Invalid amount. Use a positive number or "off"');
            return;
          }
          settings.takeProfitUSD = amount;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`📊 Take profit target set to $${amount} per deal`);
          logger.info('Take profit target updated', { amount });
        }
      } else if (args[0].toLowerCase() === 'sl') {
        if (args[1].toLowerCase() === 'off') {
          settings.stopLossUSD = null;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply('📊 Stop loss target disabled');
          logger.info('Stop loss target disabled');
        } else {
          const amount = parseFloat(args[1]);
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Invalid amount. Use a positive number or "off"');
            return;
          }
          settings.stopLossUSD = amount;
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`📊 Stop loss target set to $${amount} per deal`);
          logger.info('Stop loss target updated', { amount });
        }
      } else if (args[0].toLowerCase() === 'size') {
        const symbol = args[1].toUpperCase();
        const volume = parseFloat(args[2]);
        if (isNaN(volume) || volume <= 0) {
          await ctx.reply('❌ Invalid volume');
          return;
        }
        settings.symbolLotSizes[symbol] = volume;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        await ctx.reply(`📊 Lot size for ${symbol} set to ${volume}`);
        logger.info('Lot size updated', { symbol, volume });
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
