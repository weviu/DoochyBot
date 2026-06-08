"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pauseCmd = pauseCmd;
const state_1 = require("../../state");
async function pauseCmd(ctx) {
    state_1.state.paused = true;
    await ctx.reply("Trading paused. Use /resume to enable.");
}
//# sourceMappingURL=pause.js.map