"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.state = exports.DEFAULT_SETTINGS = void 0;
exports.initSettings = initSettings;
exports.persistSettings = persistSettings;
exports.persistRuntime = persistRuntime;
exports.setTradingLock = setTradingLock;
const storage_1 = require("./storage");
exports.DEFAULT_SETTINGS = {
    allowedSymbols: ["BTCUSD", "XAUUSD", "XAGUSD"],
    maxPositions: 3,
    maxDailyLossUSD: 200,
    stopLossPercent: 0.5,
    takeProfitPercent: 0.75,
    minHoldSeconds: 60,
    riskPerTradeUSD: 0,
    dailyProfitCapUSD: 0,
    capBufferUSD: 0,
    maxConsecutiveLosses: 3,
    lossWindowMinutes: 60,
    cooldownMinutes: 120,
    reentryCooldownMinutes: 10,
    maxCombinedRiskUSD: 0,
};
exports.state = {
    paused: false,
    tradingLocked: false,
    dailyRealizedPnL: 0,
    dailyPnLSeeded: false,
    settings: { ...exports.DEFAULT_SETTINGS },
    positions: new Map(),
    pendingOrders: new Map(),
    lastSignalTime: new Map(),
    accountInfo: { balance: 0, equity: 0, currency: "USD" },
    symbolMap: new Map(),
    lossReentry: new Map(),
    symbolCooldowns: new Map(),
};
function initSettings() {
    const saved = (0, storage_1.loadSettings)();
    if (saved) {
        if (saved.allowedSymbols)
            exports.state.settings.allowedSymbols = saved.allowedSymbols;
        if (saved.maxPositions)
            exports.state.settings.maxPositions = saved.maxPositions;
        if (saved.maxDailyLossUSD !== undefined)
            exports.state.settings.maxDailyLossUSD = saved.maxDailyLossUSD;
        if (saved.stopLossPercent !== undefined)
            exports.state.settings.stopLossPercent = saved.stopLossPercent;
        if (saved.takeProfitPercent !== undefined)
            exports.state.settings.takeProfitPercent = saved.takeProfitPercent;
        if (saved.minHoldSeconds !== undefined)
            exports.state.settings.minHoldSeconds = saved.minHoldSeconds;
        if (saved.riskPerTradeUSD !== undefined)
            exports.state.settings.riskPerTradeUSD = saved.riskPerTradeUSD;
        if (saved.dailyProfitCapUSD !== undefined)
            exports.state.settings.dailyProfitCapUSD = saved.dailyProfitCapUSD;
        if (saved.capBufferUSD !== undefined)
            exports.state.settings.capBufferUSD = saved.capBufferUSD;
        if (saved.maxConsecutiveLosses !== undefined)
            exports.state.settings.maxConsecutiveLosses = saved.maxConsecutiveLosses;
        if (saved.lossWindowMinutes !== undefined)
            exports.state.settings.lossWindowMinutes = saved.lossWindowMinutes;
        if (saved.cooldownMinutes !== undefined)
            exports.state.settings.cooldownMinutes = saved.cooldownMinutes;
        if (saved.reentryCooldownMinutes !== undefined)
            exports.state.settings.reentryCooldownMinutes = saved.reentryCooldownMinutes;
        if (saved.maxCombinedRiskUSD !== undefined)
            exports.state.settings.maxCombinedRiskUSD = saved.maxCombinedRiskUSD;
        console.log("[STATE] Loaded saved settings. Allowed symbols:", exports.state.settings.allowedSymbols.length);
        // Restore runtime state (active cooldowns and the trading lock) so a restart
        // does not silently clear a prop-rule cooldown or a daily-limit lock. Each is
        // re-validated: time-based cooldowns are kept only if still in the future, and
        // the lock is restored only if it was set earlier the same UTC day.
        const rt = saved.runtime;
        if (rt) {
            const now = Date.now();
            const reDur = exports.state.settings.reentryCooldownMinutes * 60_000;
            if (rt.lossReentry && reDur > 0) {
                for (const [k, t] of Object.entries(rt.lossReentry)) {
                    if (typeof t === "number" && t + reDur > now)
                        exports.state.lossReentry.set(k, t);
                }
            }
            if (rt.symbolCooldowns) {
                for (const [sym, cd] of Object.entries(rt.symbolCooldowns)) {
                    if (cd && typeof cd.until === "number" && cd.until > now) {
                        exports.state.symbolCooldowns.set(sym, { until: cd.until, triggerHits: Number(cd.triggerHits) || 0 });
                    }
                }
            }
            if (rt.tradingLocked && rt.lockDay === todayUTC()) {
                exports.state.tradingLocked = true;
            }
            console.log(`[STATE] Restored runtime: lock=${exports.state.tradingLocked}, ` +
                `${exports.state.lossReentry.size} re-entry cooldown(s), ${exports.state.symbolCooldowns.size} symbol cooldown(s)`);
        }
    }
}
function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}
// One snapshot writer for the whole file: config settings plus runtime state.
// Both persistSettings (settings changed) and persistRuntime (a cooldown or the
// lock changed) write the full, consistent snapshot so neither wipes the other.
function persistAll() {
    (0, storage_1.saveSettings)({
        allowedSymbols: exports.state.settings.allowedSymbols,
        maxPositions: exports.state.settings.maxPositions,
        maxDailyLossUSD: exports.state.settings.maxDailyLossUSD,
        stopLossPercent: exports.state.settings.stopLossPercent,
        takeProfitPercent: exports.state.settings.takeProfitPercent,
        minHoldSeconds: exports.state.settings.minHoldSeconds,
        riskPerTradeUSD: exports.state.settings.riskPerTradeUSD,
        dailyProfitCapUSD: exports.state.settings.dailyProfitCapUSD,
        capBufferUSD: exports.state.settings.capBufferUSD,
        maxConsecutiveLosses: exports.state.settings.maxConsecutiveLosses,
        lossWindowMinutes: exports.state.settings.lossWindowMinutes,
        cooldownMinutes: exports.state.settings.cooldownMinutes,
        reentryCooldownMinutes: exports.state.settings.reentryCooldownMinutes,
        maxCombinedRiskUSD: exports.state.settings.maxCombinedRiskUSD,
        runtime: {
            tradingLocked: exports.state.tradingLocked,
            lockDay: exports.state.tradingLocked ? todayUTC() : null,
            lossReentry: Object.fromEntries(exports.state.lossReentry),
            symbolCooldowns: Object.fromEntries(exports.state.symbolCooldowns),
        },
    });
}
function persistSettings() {
    persistAll();
}
// Persist runtime state (cooldowns, lock). Call after any change to them.
function persistRuntime() {
    persistAll();
}
// Set the daily-limit trading lock and persist it, so the lock survives a
// restart within the same UTC day. No-op (and no write) if already in that state.
function setTradingLock(locked) {
    if (exports.state.tradingLocked === locked)
        return;
    exports.state.tradingLocked = locked;
    persistRuntime();
}
//# sourceMappingURL=state.js.map