"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setNotifier = setNotifier;
exports.notify = notify;
// Lightweight push-notification helper. The Telegram bot instance and the
// chat IDs (allowed user IDs double as DM chat IDs) are registered at startup,
// then any module can push an alert without importing the bot directly.
let bot = null;
let chatIds = [];
function setNotifier(b, ids) {
    bot = b;
    chatIds = ids.filter((n) => !isNaN(n) && n !== 0);
}
async function notify(message) {
    if (!bot || chatIds.length === 0)
        return;
    for (const id of chatIds) {
        try {
            await bot.api.sendMessage(id, message);
        }
        catch (err) {
            console.log(`[NOTIFY] Failed to message ${id}: ${err.message}`);
        }
    }
}
//# sourceMappingURL=notify.js.map