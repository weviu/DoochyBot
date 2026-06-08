"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeCmd = resumeCmd;
const state_1 = require("../../state");
async function resumeCmd(ctx) {
    state_1.state.paused = false;
    await ctx.reply("Trading resumed.");
}
//# sourceMappingURL=resume.js.map