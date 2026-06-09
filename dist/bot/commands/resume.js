"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeCmd = resumeCmd;
const state_1 = require("../../state");
async function resumeCmd(ctx) {
    // Resume also clears a daily loss/profit-cap lock — the manual reset before
    // the automatic midnight UTC reset.
    const wasLocked = state_1.state.tradingLocked;
    state_1.state.paused = false;
    state_1.state.tradingLocked = false;
    await ctx.reply(wasLocked ? "Trading resumed. Daily limit lock cleared." : "Trading resumed.");
}
//# sourceMappingURL=resume.js.map