"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.minholdCmd = minholdCmd;
const state_1 = require("../../state");
async function minholdCmd(ctx) {
    const msg = ctx.message.text.trim();
    const parts = msg.split(/\s+/);
    if (parts.length < 2) {
        await ctx.reply(`Min hold is ${state_1.state.settings.minHoldSeconds}s (delay before TP is set). Usage: /minhold <seconds>`);
        return;
    }
    const secs = parseInt(parts[1]);
    if (isNaN(secs) || secs < 0 || secs > 3600) {
        await ctx.reply("Min hold must be between 0 and 3600 seconds.");
        return;
    }
    state_1.state.settings.minHoldSeconds = secs;
    (0, state_1.persistSettings)();
    await ctx.reply(`Min hold set to ${secs}s (delay before TP is set).`);
}
//# sourceMappingURL=minhold.js.map