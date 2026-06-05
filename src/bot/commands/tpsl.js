const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');

const MODE_LABELS = {
  pivot:  'pivot (percentage buffer from pivot levels)',
  dollar: 'dollar (fixed $ amounts)',
  auto:   'auto (pivot when available, dollar otherwise)',
};

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

      // /tpsl — show current settings
      if (args.length === 0) {
        const mode   = settings.tpsl_mode ?? 'auto';
        const slPct  = settings.sl_buffer_percent ?? 0.25;
        const tpPct  = settings.tp_buffer_percent ?? 0.15;
        const slUSD  = settings.stopLossUSD   != null ? `$${Number(settings.stopLossUSD).toFixed(2)}`   : 'off';
        const tpUSD  = settings.takeProfitUSD != null ? `$${Number(settings.takeProfitUSD).toFixed(2)}` : 'off';

        const symTP = settings.symbolTakeProfitUSD || {};
        const symSL = settings.symbolStopLossUSD || {};
        const symLines = Array.from(new Set([...Object.keys(symTP), ...Object.keys(symSL)]))
          .sort()
          .map(sym => {
            const t = symTP[sym] != null ? `TP $${Number(symTP[sym]).toFixed(2)}` : '';
            const s = symSL[sym] != null ? `SL $${Number(symSL[sym]).toFixed(2)}` : '';
            return `  ${sym}: ${[t, s].filter(Boolean).join(' | ')}`;
          });

        await ctx.reply(
          `⚙️ SL/TP Settings\n` +
          `Mode: ${mode}\n` +
          `Pivot mode: SL buffer ${slPct}% | TP buffer ${tpPct}%\n` +
          `Dollar mode: SL ${slUSD} | TP ${tpUSD}` +
          (symLines.length ? `\nPer-symbol overrides:\n${symLines.join('\n')}` : '')
        );
        return;
      }

      const sub = args[0].toLowerCase();

      // /tpsl mode <pivot|dollar|auto>
      if (sub === 'mode') {
        const modeArg = args[1]?.toLowerCase();
        if (!['pivot', 'dollar', 'auto'].includes(modeArg)) {
          await ctx.reply('❌ Invalid mode. Use: pivot, dollar, or auto\nExample: /tpsl mode auto');
          return;
        }
        settings.tpsl_mode = modeArg;
        saveSettings(settings);
        await ctx.reply(`✅ SL/TP mode set to: ${MODE_LABELS[modeArg]}`);
        logger.info('tpsl_mode updated', { mode: modeArg });
        return;
      }

      // /tpsl sl <percent>  — pivot SL buffer
      if (sub === 'sl' && args.length === 2) {
        const pct = parseFloat(args[1]);
        if (isNaN(pct) || pct < 0.05 || pct > 5.0) {
          await ctx.reply('❌ Percentage must be between 0.05 and 5.0\nExample: /tpsl sl 0.25');
          return;
        }
        settings.sl_buffer_percent = pct;
        saveSettings(settings);
        await ctx.reply(`✅ Pivot SL buffer set to ${pct}%`);
        logger.info('sl_buffer_percent updated', { pct });
        return;
      }

      // /tpsl tp <percent>  — pivot TP buffer
      if (sub === 'tp' && args.length === 2) {
        const pct = parseFloat(args[1]);
        if (isNaN(pct) || pct < 0.05 || pct > 5.0) {
          await ctx.reply('❌ Percentage must be between 0.05 and 5.0\nExample: /tpsl tp 0.15');
          return;
        }
        settings.tp_buffer_percent = pct;
        saveSettings(settings);
        await ctx.reply(`✅ Pivot TP buffer set to ${pct}%`);
        logger.info('tp_buffer_percent updated', { pct });
        return;
      }

      // /tpsl usd sl <amount>           — global SL
      // /tpsl usd tp <amount>           — global TP
      // /tpsl usd sl <SYMBOL> <amount>  — per-symbol SL
      // /tpsl usd tp <SYMBOL> <amount>  — per-symbol TP
      if (sub === 'usd') {
        const field = args[1]?.toLowerCase();
        if (!['sl', 'tp'].includes(field)) {
          await ctx.reply('❌ Usage: /tpsl usd sl <amount>  or  /tpsl usd tp <SYMBOL> <amount>');
          return;
        }

        // Per-symbol form: args[2] is non-numeric → treat as symbol, amount is args[3]
        const isPerSymbol = args[2] && isNaN(parseFloat(args[2]));
        const symbol = isPerSymbol ? args[2].toUpperCase() : null;
        const amount = parseFloat(isPerSymbol ? args[3] : args[2]);

        if (isNaN(amount) || amount <= 0) {
          const ex = symbol ? `/tpsl usd ${field} ${symbol} 25` : `/tpsl usd ${field} 10`;
          await ctx.reply(`❌ Amount must be a positive number\nExample: ${ex}`);
          return;
        }

        if (field === 'sl') {
          if (symbol) {
            settings.symbolStopLossUSD = settings.symbolStopLossUSD || {};
            settings.symbolStopLossUSD[symbol] = amount;
            saveSettings(settings);
            await ctx.reply(`✅ SL for ${symbol} set to $${amount.toFixed(2)}`);
            logger.info('symbolStopLossUSD updated', { symbol, amount });
          } else {
            settings.stopLossUSD = amount;
            saveSettings(settings);
            await ctx.reply(`✅ Dollar SL set to $${amount.toFixed(2)} (all symbols)`);
            logger.info('stopLossUSD updated', { amount });
          }
        } else {
          if (symbol) {
            settings.symbolTakeProfitUSD = settings.symbolTakeProfitUSD || {};
            settings.symbolTakeProfitUSD[symbol] = amount;
            saveSettings(settings);
            await ctx.reply(`✅ TP for ${symbol} set to $${amount.toFixed(2)}`);
            logger.info('symbolTakeProfitUSD updated', { symbol, amount });
          } else {
            settings.takeProfitUSD = amount;
            saveSettings(settings);
            await ctx.reply(`✅ Dollar TP set to $${amount.toFixed(2)} (all symbols)`);
            logger.info('takeProfitUSD updated', { amount });
          }
        }
        return;
      }

      // Unknown subcommand
      await ctx.reply(
        `⚙️ /tpsl — SL/TP mode control\n\n` +
        `/tpsl — Show current settings\n` +
        `/tpsl mode <pivot|dollar|auto> — Set mode\n` +
        `/tpsl sl <percent> — Pivot SL buffer % (0.05–5.0)\n` +
        `/tpsl tp <percent> — Pivot TP buffer % (0.05–5.0)\n` +
        `/tpsl usd sl <amount> — Dollar SL amount\n` +
        `/tpsl usd tp <amount> — Dollar TP amount\n\n` +
        `Modes:\n` +
        `  auto   — Use signal SL/TP if present, dollar otherwise\n` +
        `  pivot  — Always trust signal SL/TP (never override)\n` +
        `  dollar — Always recalculate from fixed $ amounts`
      );
    } catch (err) {
      logger.error('tpsl command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
