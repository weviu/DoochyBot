const HELP_TEXT = `
/status - Account and position summary
/balance - Account balance and margin
/positions - List open positions
/pause - Stop executing new signals
/resume - Resume executing signals
/closeall - Close all open positions
/risk daily <pct> - Set daily loss limit (%)
/risk size <symbol> <lots> - Set lot size
/risk mode <fixed|percent> - Set sizing mode
/risk percent <pct> - Set risk per trade (%)
/risk sltp <auto|dollar|pivot> - Set SL/TP mode
/risk minhold <seconds> - Set min hold time
/symbols - List allowed symbols
/symbols add all - Add every symbol from cTrader
/symbols add <symbol> <lots> - Add symbol
/symbols remove <symbol> - Remove symbol
/confirm <on|off> - Toggle auto-execute
/setchatid - Save chat for alerts
/export - Export trade history
`.trim();

async function helpCmd(ctx) {
  await ctx.reply(HELP_TEXT);
}

module.exports = { helpCmd };
