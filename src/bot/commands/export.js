const fs = require('fs');
const path = require('path');

const TRADE_LOG = path.join(__dirname, '../../../data/tradeLog.jsonl');
const MAX_MSG_LEN = 4096;

function parseDate(str) {
  return new Date(str.replace('_', 'T'));
}

async function exportCmd(ctx) {
  const parts = (ctx.message.text || '').trim().split(/\s+/).slice(1);

  let fromDate, toDate;
  const now = new Date();

  if (parts.length === 0) {
    fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 7);
    toDate = now;
  } else if (parts.length === 1) {
    fromDate = parseDate(parts[0]);
    toDate = now;
  } else {
    fromDate = parseDate(parts[0]);
    toDate = parseDate(parts[1]);
  }

  if (isNaN(fromDate) || isNaN(toDate)) {
    await ctx.reply('Invalid date. Use: /export 2026-06-01 or /export 2026-06-01 2026-06-05');
    return;
  }

  if (!fs.existsSync(TRADE_LOG)) {
    await ctx.reply('No trade history yet.');
    return;
  }

  const raw = fs.readFileSync(TRADE_LOG, 'utf8').trim();
  if (!raw) {
    await ctx.reply('No trade history yet.');
    return;
  }

  const trades = raw.split('\n').map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  const filtered = trades.filter(t => {
    const d = new Date(t.timestamp);
    return d >= fromDate && d <= toDate;
  });

  if (filtered.length === 0) {
    await ctx.reply('No trades found for this period.');
    return;
  }

  const closed = filtered.filter(t => t.exitPrice != null);
  const totalPnL = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const pnlSign = totalPnL >= 0 ? '+' : '';

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const header = [
    'TRADE HISTORY',
    '=============',
    `Period: ${fromStr} to ${toStr}`,
    `Trades: ${filtered.length} (${closed.length} closed)`,
    `Realized P&L: ${pnlSign}$${Math.abs(totalPnL).toFixed(2)}`,
    '',
  ].join('\n');

  const tradeLines = filtered.map((t, i) => {
    const status = t.exitPrice != null ? '[CLOSED]' : '[OPEN]';
    let block = `#${i + 1} ${t.direction} ${t.volume} ${t.symbol} ${status} (#${t.positionId})`;
    block += `\n   Opened: ${t.timestamp ? t.timestamp.slice(0, 16).replace('T', ' ') : 'unknown'}`;
    if (t.exitPrice != null) {
      const holdStr = t.holdTime != null ? ` (${Math.round(t.holdTime / 60)}m)` : '';
      block += `\n   Closed:${holdStr}`;
      block += `\n   Entry -> Exit: ${t.entryPrice} -> ${t.exitPrice}`;
      const pnlSign2 = (t.pnl || 0) >= 0 ? '+' : '';
      block += `\n   P&L: ${pnlSign2}$${Math.abs(t.pnl || 0).toFixed(2)}`;
    }
    return block;
  });

  const chunks = [];
  let current = header;
  for (const line of tradeLines) {
    if ((current + line + '\n').length > MAX_MSG_LEN) {
      chunks.push(current);
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

module.exports = { exportCmd };
