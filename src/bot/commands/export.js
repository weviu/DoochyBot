const logger = require('../../utils/logger');
const { InputFile } = require('grammy');

// Parse user date input: YYYY-MM-DD or YYYY-MM-DD_HH:MM (treated as UTC)
function parseDate(str) {
  if (!str) return null;
  const clean = str.replace('_', ' ');
  const iso = clean.replace(' ', 'T') + (clean.includes(':') ? ':00Z' : 'T00:00:00Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtPnL(val) {
  if (val == null) return null;
  return `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
}

function buildText(positions, fromDate, toDate) {
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  const closed = positions.filter(p => p.status === 'closed');
  const open = positions.filter(p => p.status === 'open');

  const totalRealized = closed.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);

  const periodLine = fromDate
    ? `Period:   ${fromDate.toISOString().split('T')[0]}${toDate ? ' to ' + toDate.toISOString().split('T')[0] : ' onwards'}`
    : 'Period:   all time';

  const lines = [
    'TRADE HISTORY',
    '=============',
    `Exported: ${now} UTC`,
    `Trades:   ${positions.length}  (${closed.length} closed, ${open.length} open)`,
    periodLine,
    `Realized P&L: ${fmtPnL(parseFloat(totalRealized.toFixed(2)))}`,
  ];

  positions.forEach((p, i) => {
    lines.push('');
    const statusTag = p.status === 'open' ? '[OPEN]' : '[CLOSED]';
    lines.push(`#${i + 1}  ${p.direction} ${p.volume} ${p.symbol}  ${statusTag}  (#${p.positionId || 'N/A'})`);
    lines.push(`    Opened:  ${p.openTime || 'N/A'}`);

    if (p.status === 'closed') {
      const dur = p.duration ? `  (${p.duration})` : '';
      lines.push(`    Closed:  ${p.closeTime || 'N/A'}${dur}`);
      lines.push(`    Entry → Close:  ${p.entryPrice ?? 'N/A'} → ${p.closePrice ?? 'N/A'}`);

      // Net P&L (matches cTrader "Net USD") with optional detail breakdown
      const details = [];
      if (p.grossPnL != null && p.grossPnL !== p.realizedPnL) details.push(`gross: ${fmtPnL(p.grossPnL)}`);
      if (p.swap && p.swap !== 0) details.push(`swap: ${fmtPnL(p.swap)}`);
      if (p.commission && p.commission !== 0) details.push(`comm: ${fmtPnL(p.commission)}`);
      const detailStr = details.length ? `  (${details.join(', ')})` : '';
      lines.push(`    P&L:  ${fmtPnL(p.realizedPnL)}${detailStr}`);
    } else {
      lines.push(`    Entry:   ${p.entryPrice ?? 'N/A'}`);
      const livePnL = p.unrealizedPnL != null ? `${fmtPnL(p.unrealizedPnL)} (live)` : 'N/A';
      lines.push(`    P&L:  ${livePnL}`);
    }
  });

  lines.push('');
  lines.push('--- end of export ---');
  return lines.join('\n');
}

module.exports = (proxyUrl) => {
  return async (ctx) => {
    try {
      const fetch = require('node-fetch');
      const args = ctx.message.text.split(' ').slice(1);

      let fromDate = null;
      let toDate = null;

      if (args.length >= 1) {
        fromDate = parseDate(args[0]);
        if (!fromDate) {
          await ctx.reply(
            '❌ Invalid date format.\n' +
            'Usage: /export [from] [to]\n' +
            'Formats: 2026-06-01  or  2026-06-01_12:30\n\n' +
            '/export — last 7 days\n' +
            '/export 2026-06-01 — from June 1st\n' +
            '/export 2026-06-01 2026-06-05 — date range\n' +
            '/export 2026-06-01_00:00 2026-06-05_23:59 — with time'
          );
          return;
        }
      }

      if (args.length >= 2) {
        toDate = parseDate(args[1]);
        if (!toDate) {
          await ctx.reply('❌ Invalid to-date. Format: YYYY-MM-DD or YYYY-MM-DD_HH:MM');
          return;
        }
      }

      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate.getTime());
      if (toDate) params.set('to', toDate.getTime());

      const url = `${proxyUrl}/history${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!result.success) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      const positions = result.data;
      if (positions.length === 0) {
        await ctx.reply('ℹ️ No trades found for the specified period.');
        return;
      }

      const text = buildText(positions, fromDate, toDate);

      const rangeStr = fromDate
        ? `${args[0]}${toDate ? '_to_' + args[1] : '_onwards'}`
        : 'last7d';
      const filename = `trades_${rangeStr}.txt`;

      await ctx.replyWithDocument(
        new InputFile(Buffer.from(text, 'utf-8'), filename),
        { caption: `📊 ${positions.length} trade(s) exported` }
      );

      if (result.hasMore) {
        await ctx.reply('ℹ️ Note: cTrader returned more deals than shown. Try a narrower date range for full history.');
      }

      logger.info('Export executed', { count: positions.length, fromDate, toDate });
    } catch (err) {
      logger.error('Export command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
