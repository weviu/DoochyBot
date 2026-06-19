"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsCmd = notificationsCmd;
const state_1 = require("../../state");
// Toggle the Telegram message sent whenever an order fills.
async function notificationsCmd(ctx) {
    const arg = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();
    if (arg === "on" || arg === "off") {
        state_1.state.settings.notifyFills = arg === "on";
        (0, state_1.persistSettings)();
        await ctx.reply(state_1.state.settings.notifyFills
            ? "Order notifications on. You will get a message when an order fills."
            : "Order notifications off.");
        return;
    }
    await ctx.reply(`Order notifications are ${state_1.state.settings.notifyFills ? "on" : "off"}. Usage: /notifications on | off`);
}
//# sourceMappingURL=notifications.js.map