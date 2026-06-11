"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.state = exports.DEFAULT_SETTINGS = void 0;
exports.initSettings = initSettings;
exports.persistSettings = persistSettings;
const storage_1 = require("./storage");
exports.DEFAULT_SETTINGS = {
    allowedSymbols: ["BTCUSD", "XAUUSD", "XAGUSD"],
    maxPositions: 3,
    dailyLossLimitPercent: 2,
    maxDailyLossUSD: 200,
    stopLossPercent: 0.5,
    takeProfitPercent: 0.75,
    minHoldSeconds: 60,
    lotSize: 0.01,
    symbolLotSize: {},
    dailyProfitCapUSD: 0,
    capBufferUSD: 0,
    maxConsecutiveLosses: 3,
    lossWindowMinutes: 60,
    cooldownMinutes: 120,
};
exports.state = {
    paused: false,
    tradingLocked: false,
    dailyRealizedPnL: 0,
    dailyPnLSeeded: false,
    settings: { ...exports.DEFAULT_SETTINGS },
    positions: new Map(),
    lastSignalTime: new Map(),
    accountInfo: { balance: 0, equity: 0, currency: "USD" },
    symbolMap: new Map(),
};
function initSettings() {
    const saved = (0, storage_1.loadSettings)();
    if (saved) {
        if (saved.allowedSymbols)
            exports.state.settings.allowedSymbols = saved.allowedSymbols;
        if (saved.maxPositions)
            exports.state.settings.maxPositions = saved.maxPositions;
        if (saved.dailyLossLimitPercent !== undefined)
            exports.state.settings.dailyLossLimitPercent = saved.dailyLossLimitPercent;
        if (saved.maxDailyLossUSD !== undefined)
            exports.state.settings.maxDailyLossUSD = saved.maxDailyLossUSD;
        if (saved.stopLossPercent !== undefined)
            exports.state.settings.stopLossPercent = saved.stopLossPercent;
        if (saved.takeProfitPercent !== undefined)
            exports.state.settings.takeProfitPercent = saved.takeProfitPercent;
        if (saved.minHoldSeconds !== undefined)
            exports.state.settings.minHoldSeconds = saved.minHoldSeconds;
        if (saved.lotSize !== undefined)
            exports.state.settings.lotSize = saved.lotSize;
        if (saved.symbolLotSize)
            exports.state.settings.symbolLotSize = saved.symbolLotSize;
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
        console.log("[STATE] Loaded saved settings. Allowed symbols:", exports.state.settings.allowedSymbols.length);
    }
}
function persistSettings() {
    (0, storage_1.saveSettings)({
        allowedSymbols: exports.state.settings.allowedSymbols,
        maxPositions: exports.state.settings.maxPositions,
        dailyLossLimitPercent: exports.state.settings.dailyLossLimitPercent,
        maxDailyLossUSD: exports.state.settings.maxDailyLossUSD,
        stopLossPercent: exports.state.settings.stopLossPercent,
        takeProfitPercent: exports.state.settings.takeProfitPercent,
        minHoldSeconds: exports.state.settings.minHoldSeconds,
        lotSize: exports.state.settings.lotSize,
        symbolLotSize: exports.state.settings.symbolLotSize,
        dailyProfitCapUSD: exports.state.settings.dailyProfitCapUSD,
        capBufferUSD: exports.state.settings.capBufferUSD,
        maxConsecutiveLosses: exports.state.settings.maxConsecutiveLosses,
        lossWindowMinutes: exports.state.settings.lossWindowMinutes,
        cooldownMinutes: exports.state.settings.cooldownMinutes,
    });
}
//# sourceMappingURL=state.js.map