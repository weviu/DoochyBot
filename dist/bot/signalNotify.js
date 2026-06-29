"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeNotifySignal = maybeNotifySignal;
const state_1 = require("../state");
const notify_1 = require("./notify");
// Notify on every incoming signal (whether or not the gate executes it), so the
// user can act on it manually when trading somewhere other than cTrader. Fires
// only when signalNotify is on and the signal scores at least
// signalNotifyMinConfidence. Independent of the execution path and the entry
// gate. Called once per signal at the top of the gate, before any rejection.
function maybeNotifySignal(signal) {
    if (!state_1.state.settings.signalNotify)
        return;
    const conf = signal.confidence ?? 0;
    if (conf < state_1.state.settings.signalNotifyMinConfidence)
        return;
    // Green orb for buys, red orb for sells, per request.
    const orb = signal.direction === "BUY" ? "\u{1F7E2}" : "\u{1F534}";
    const lines = [`${orb} ${signal.direction} ${signal.symbol}`, `Confidence: ${conf}`];
    if (signal.price)
        lines.push(`Price: ${signal.price}`);
    if (signal.sl != null)
        lines.push(`SL: ${signal.sl}`);
    if (signal.tp != null)
        lines.push(`TP: ${signal.tp}`);
    if (signal.orderType === "LIMIT" && signal.limitPrice != null)
        lines.push(`Limit: ${signal.limitPrice}`);
    (0, notify_1.notify)(lines.join("\n")).catch(() => { });
}
//# sourceMappingURL=signalNotify.js.map