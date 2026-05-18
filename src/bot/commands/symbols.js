const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      if (!args[0]) {
        // Show current symbols
        let symbolText = '📌 Allowed Symbols\n\n';
        settings.allowedSymbols.forEach(sym => {
          const size = settings.symbolLotSizes[sym] || 'N/A';
          symbolText += `• ${sym}: ${size} lots\n`;
        });
        await ctx.reply(symbolText);
        return;
      }

      if (args[0].toLowerCase() === 'add') {
        const symbol = args[1]?.toUpperCase();
        const volume = parseFloat(args[2]);

        if (!symbol || isNaN(volume) || volume <= 0) {
          await ctx.reply('Usage: /symbols add <symbol> <volume>');
          return;
        }

        if (!settings.allowedSymbols.includes(symbol)) {
          settings.allowedSymbols.push(symbol);
        }
        settings.symbolLotSizes[symbol] = volume;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        await ctx.reply(`✅ Added ${symbol} with lot size ${volume}`);
        logger.info('Symbol added', { symbol, volume });
      } else if (args[0].toLowerCase() === 'remove') {
        const symbol = args[1]?.toUpperCase();

        if (!symbol) {
          await ctx.reply('Usage: /symbols remove <symbol>');
          return;
        }

        const idx = settings.allowedSymbols.indexOf(symbol);
        if (idx > -1) {
          settings.allowedSymbols.splice(idx, 1);
          delete settings.symbolLotSizes[symbol];
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`✅ Removed ${symbol}`);
          logger.info('Symbol removed', { symbol });
        } else {
          await ctx.reply(`❌ ${symbol} not found`);
        }
      }
    } catch (err) {
      logger.error('Symbols command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
