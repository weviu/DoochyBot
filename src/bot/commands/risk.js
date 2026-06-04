const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);

      if (args.length < 2) {
        await ctx.reply(
          `Usage:\n` +
          `/risk daily <percent>  - Set daily loss limit\n` +
          `/risk size <symbol> <volume> - Set lot size for symbol\n` +
          `/risk positions <number> - Set max open positions (1-50)`
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
      }
    } catch (err) {
      logger.error('Risk command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
