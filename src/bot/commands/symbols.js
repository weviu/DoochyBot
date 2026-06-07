const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { COMMON_SYMBOLS } = require('../../utils/symbols');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      if (!args[0]) {
        await ctx.reply(
          `Usage:\n` +
          `/symbols list — show allowed symbols & lot sizes\n` +
          `/symbols add <SYMBOL> <volume> — add a symbol\n` +
          `/symbols add all [volume] — add all known symbols\n` +
          `/symbols remove <SYMBOL> — remove a symbol`
        );
        return;
      }

      if (args[0].toLowerCase() === 'list') {
        let symbolText = '📌 Allowed Symbols\n\n';
        settings.allowedSymbols.forEach(sym => {
          const size = settings.symbolLotSizes[sym] || 'N/A';
          symbolText += `• ${sym}: ${size} lots\n`;
        });
        await ctx.reply(symbolText);
        return;
      }

      if (args[0].toLowerCase() === 'add') {
        // /symbols add all  → add every known symbol at 0.01 lot
        if (args[1]?.toLowerCase() === 'all') {
          const defaultLot = parseFloat(args[2]) || 0.01;
          const known = Object.keys(COMMON_SYMBOLS).filter(s => s !== 'GOLD' && s !== 'OIL'); // skip aliases
          let added = 0;
          for (const sym of known) {
            if (!settings.allowedSymbols.includes(sym)) {
              settings.allowedSymbols.push(sym);
              added++;
            }
            if (!settings.symbolLotSizes[sym]) settings.symbolLotSizes[sym] = defaultLot;
          }
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          await ctx.reply(`✅ Added ${added} new symbols at ${defaultLot} lots each\n(${known.length} total symbols now configured)`);
          logger.info('All symbols added', { count: added, defaultLot });
          return;
        }

        const symbol = args[1]?.toUpperCase();
        const volume = parseFloat(args[2]);

        if (!symbol || isNaN(volume) || volume <= 0) {
          await ctx.reply('Usage: /symbols add <SYMBOL> <volume>\n       /symbols add all [volume]');
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
