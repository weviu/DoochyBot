"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionsCmd = positionsCmd;
const state_1 = require("../../state");
const orders_1 = require("../../ctrader/orders");
async function positionsCmd(ctx) {
    const connection = (0, orders_1.getConnection)();
    if (state_1.state.positions.size === 0) {
        await ctx.reply("No open positions.");
        return;
    }
    // Re-reconcile to get current mark prices from the broker. Falls back to the
    // in-memory entry price (P&L shows as 0) if the request fails.
    const markPrices = new Map(); // positionId → current mark price
    const slMap = new Map();
    const tpMap = new Map();
    if (connection) {
        try {
            const res = await connection.sendCommand("ProtoOAReconcileReq", {
                ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
            });
            for (const p of res.position || []) {
                markPrices.set(p.positionId, Number(p.price) || 0);
                slMap.set(p.positionId, p.stopLoss ?? null);
                tpMap.set(p.positionId, p.takeProfit ?? null);
            }
        }
        catch {
            // Non-fatal — P&L will be unknown
        }
    }
    const lines = [];
    let totalPnL = 0;
    for (const [posId, pos] of state_1.state.positions.entries()) {
        const markPrice = markPrices.get(posId) ?? pos.entryPrice;
        const sl = slMap.get(posId) ?? pos.sl;
        const tp = tpMap.get(posId) ?? pos.tp;
        // Unrealized P&L = price move × lots × lot-size-in-units.
        // We need the lotSize (units per lot) from the symbol spec to convert
        // volume to a notional. If unavailable, fall back to displaying "?".
        let pnlStr = "?";
        const symbolId = state_1.state.symbolMap.get(pos.symbol);
        if (symbolId !== undefined && markPrice && pos.entryPrice) {
            try {
                const spec = await (0, orders_1.getSymbolSpec)(symbolId);
                if (spec?.lotSize) {
                    const priceDiff = pos.direction === "BUY"
                        ? markPrice - pos.entryPrice
                        : pos.entryPrice - markPrice;
                    // spec.lotSize is in broker volume cents per lot; divide by 100 to get
                    // the notional units, then multiply by price diff to get rough P&L.
                    // This is an approximation for non-USD-quoted pairs, but good enough
                    // for a live glance.
                    const units = (pos.volumeCents / 100);
                    const pnl = priceDiff * units;
                    totalPnL += pnl;
                    pnlStr = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`;
                }
            }
            catch {
                // Leave as "?"
            }
        }
        const fmt = (v) => v != null ? String(v) : "—";
        lines.push(`${pos.direction} ${pos.symbol} ${pos.volume}L\n` +
            `  Entry: ${pos.entryPrice}  Mark: ${markPrice || "?"}\n` +
            `  SL: ${fmt(sl)}  TP: ${fmt(tp)}\n` +
            `  P&L: ${pnlStr}`);
    }
    const summary = `Open positions (${state_1.state.positions.size}):\n\n` +
        lines.join("\n\n") +
        (state_1.state.positions.size > 1 ? `\n\nTotal P&L: ${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}` : "");
    await ctx.reply(summary);
}
//# sourceMappingURL=positions.js.map