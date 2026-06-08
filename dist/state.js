"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.state = void 0;
exports.initSettings = initSettings;
exports.persistSettings = persistSettings;
const storage_1 = require("./storage");
const DEFAULT_SETTINGS = {
    allowedSymbols: ["BTCUSD", "XAUUSD", "XAGUSD"],
    maxPositions: 3,
    dailyLossLimitPercent: 2,
    maxDailyLossUSD: 200,
    sltpMode: "auto",
    stopLossUSD: 30,
    takeProfitUSD: 45,
    symbolStopLossUSD: {},
    symbolTakeProfitUSD: {},
    minHoldSeconds: 60,
    lotSize: 0.01,
    symbolLotSize: {},
};
exports.state = {
    paused: false,
    tradingLocked: false,
    dailyRealizedPnL: 0,
    settings: { ...DEFAULT_SETTINGS },
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
        if (saved.sltpMode)
            exports.state.settings.sltpMode = saved.sltpMode;
        if (saved.stopLossUSD !== undefined)
            exports.state.settings.stopLossUSD = saved.stopLossUSD;
        if (saved.takeProfitUSD !== undefined)
            exports.state.settings.takeProfitUSD = saved.takeProfitUSD;
        if (saved.symbolStopLossUSD)
            exports.state.settings.symbolStopLossUSD = saved.symbolStopLossUSD;
        if (saved.symbolTakeProfitUSD)
            exports.state.settings.symbolTakeProfitUSD = saved.symbolTakeProfitUSD;
        if (saved.minHoldSeconds !== undefined)
            exports.state.settings.minHoldSeconds = saved.minHoldSeconds;
        if (saved.lotSize !== undefined)
            exports.state.settings.lotSize = saved.lotSize;
        if (saved.symbolLotSize)
            exports.state.settings.symbolLotSize = saved.symbolLotSize;
        console.log("[STATE] Loaded saved settings. Allowed symbols:", exports.state.settings.allowedSymbols.length);
    }
}
function persistSettings() {
    (0, storage_1.saveSettings)({
        allowedSymbols: exports.state.settings.allowedSymbols,
        maxPositions: exports.state.settings.maxPositions,
        dailyLossLimitPercent: exports.state.settings.dailyLossLimitPercent,
        maxDailyLossUSD: exports.state.settings.maxDailyLossUSD,
        sltpMode: exports.state.settings.sltpMode,
        stopLossUSD: exports.state.settings.stopLossUSD,
        takeProfitUSD: exports.state.settings.takeProfitUSD,
        symbolStopLossUSD: exports.state.settings.symbolStopLossUSD,
        symbolTakeProfitUSD: exports.state.settings.symbolTakeProfitUSD,
        minHoldSeconds: exports.state.settings.minHoldSeconds,
        lotSize: exports.state.settings.lotSize,
        symbolLotSize: exports.state.settings.symbolLotSize,
    });
}
//# sourceMappingURL=state.js.map