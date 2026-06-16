"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWebhookServer = startWebhookServer;
const express_1 = __importDefault(require("express"));
const gate_1 = require("./risk/gate");
const PORT = 9009;
/**
 * Parse DoochyBot's plain-text signal format into a ParsedSignal:
 *
 *     BUY XAUUSD SL=4300.2 TP=4345.82               (market — fills now)
 *     SELL XAUUSD LIMIT=4329 SL=4350 TP=4300        (limit  — rests until 4329)
 *
 * This is the format the channel-listener POSTs. Fields the feed carries but
 * this format doesn't (rsi, price, confidence, etc.) are defaulted — market
 * orders size from the live mark price; SL/TP/LIMIT here are absolute prices the
 * order pipeline applies directly. The optional LIMIT=<price> selects a resting
 * limit order at that price; without it the signal is a market order.
 */
function parseTextSignal(text) {
    const m = text.trim().match(/^(BUY|SELL)\s+(\S+)\s+(?:LIMIT=([\d.]+)\s+)?SL=([\d.]+)\s+TP=([\d.]+)/i);
    if (!m)
        return null;
    const limitPrice = m[3] !== undefined ? parseFloat(m[3]) : undefined;
    const sl = parseFloat(m[4]);
    const tp = parseFloat(m[5]);
    if (Number.isNaN(sl) || Number.isNaN(tp))
        return null;
    if (limitPrice !== undefined && Number.isNaN(limitPrice))
        return null;
    return {
        symbol: m[2].toUpperCase(),
        direction: m[1].toUpperCase(),
        rsi: 0,
        price: 0,
        pivotLevel: null,
        pivotDistance: null,
        confidence: 0,
        timeframe: "",
        timestamp: new Date().toISOString(),
        sl,
        tp,
        orderType: limitPrice !== undefined ? "LIMIT" : "MARKET",
        limitPrice,
    };
}
/**
 * Start the localhost-only HTTP server that lets the channel-listener push
 * time-sensitive signals straight into the same gate/execution path the poller
 * uses, instead of waiting for the next 10s poll.
 */
function startWebhookServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.text({ type: "*/*" }));
    app.post("/webhook", (req, res) => {
        const body = typeof req.body === "string" ? req.body : "";
        console.log(`[WEBHOOK] Received: ${JSON.stringify(body)}`);
        const signal = parseTextSignal(body);
        if (!signal) {
            console.log("[WEBHOOK] Rejected: could not parse signal");
            return res.status(400).send("Could not parse signal");
        }
        const result = (0, gate_1.processSignal)(signal);
        if (!result.accepted) {
            return res.status(200).send(`Signal rejected: ${result.reason ?? "unknown reason"}`);
        }
        return res.status(200).send(`Signal accepted: ${signal.direction} ${signal.symbol} executing`);
    });
    // Bind to loopback only — the webhook is never exposed to the internet.
    app.listen(PORT, "127.0.0.1", () => {
        console.log(`[WEBHOOK] Listening on http://127.0.0.1:${PORT}/webhook`);
    });
}
//# sourceMappingURL=webhook.js.map