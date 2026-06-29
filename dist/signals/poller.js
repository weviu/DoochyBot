"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPoller = startPoller;
const parser_1 = require("./parser");
const FEED_URL = "https://signals.route07.com/alerts.json";
const INTERVAL_MS = 10_000;
let lastTimestamp = null;
function startPoller(onSignal) {
    console.log(`[POLLER] Starting. Feed: ${FEED_URL}`);
    const poll = async () => {
        try {
            const res = await fetch(FEED_URL);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const alerts = (await res.json());
            if (!lastTimestamp) {
                // First fetch — store the latest timestamp, don't process anything
                if (alerts.length > 0) {
                    lastTimestamp = alerts[0].timestamp;
                    console.log(`[POLLER] Connected. ${alerts.length} alerts in feed. Last: ${lastTimestamp}`);
                }
                return;
            }
            const newAlerts = alerts.filter((a) => a.timestamp > lastTimestamp);
            if (newAlerts.length === 0)
                return;
            console.log(`[POLLER] ${newAlerts.length} new signal(s)`);
            // Process oldest first
            for (const alert of newAlerts.reverse()) {
                const signal = (0, parser_1.parseSignal)(alert);
                if (signal) {
                    console.log(`[POLLER] → ${signal.direction} ${signal.symbol} | RSI: ${signal.rsi} | Confidence: ${signal.confidence}`);
                    onSignal(signal);
                }
            }
            lastTimestamp = newAlerts[newAlerts.length - 1].timestamp;
        }
        catch (err) {
            console.warn(`[POLLER] Fetch failed: ${err.message}`);
        }
    };
    poll(); // Run immediately
    setInterval(poll, INTERVAL_MS);
}
//# sourceMappingURL=poller.js.map