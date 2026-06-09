"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeallCmd = closeallCmd;
const state_1 = require("../../state");
const midnightClose_1 = require("../../risk/midnightClose");
async function closeallCmd(ctx) {
    const count = state_1.state.positions.size;
    if (count === 0) {
        await ctx.reply("No open positions to close.");
        return;
    }
    await ctx.reply(`Closing ${count} positions...`);
    const { closed, failed } = await (0, midnightClose_1.closeAllPositions)();
    await ctx.reply(`Closed ${closed} positions. Failed: ${failed}`);
}
//# sourceMappingURL=closeall.js.map