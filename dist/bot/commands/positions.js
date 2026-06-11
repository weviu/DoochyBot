"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionsCmd = positionsCmd;
const state_1 = require("../../state");
const livePrices_1 = require("../../ctrader/livePrices");
async function positionsCmd(ctx) {
    if (state_1.state.positions.size === 0) {
        await ctx.reply("No open positions.");
        return;
    }
    const lines = [];
    let totalPnL = 0;
    for (const [posId, pos] of state_1.state.positions.entries()) {
        const sl = pos.sl;
        const tp = pos.tp;
        const mark = (0, livePrices_1.getMarkPrice)(pos.symbol, pos.direction) ?? pos.entryPrice;
        const priceDiff = pos.direction === "BUY" ? mark - pos.entryPrice : pos.entryPrice - mark;
        const units = pos.volumeCents / 100;
        const pnl = priceDiff * units;
        totalPnL += pnl;
        const pnlStr = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`;
        const fmt = (v) => v != null ? String(v) : "—";
        lines.push(`${pos.direction} ${pos.symbol} ${pos.volume}L\n` +
            `  Entry: ${pos.entryPrice}  Mark: ${mark}\n` +
            `  SL: ${fmt(sl)}  TP: ${fmt(tp)}\n` +
            `  P&L: ${pnlStr}`);
    }
    const summary = `Open positions (${state_1.state.positions.size}):\n\n` +
        lines.join("\n\n") +
        (state_1.state.positions.size > 1 ? `\n\nTotal P&L: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}` : "");
    await ctx.reply(summary);
}
//# sourceMappingURL=positions.js.map