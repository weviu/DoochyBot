import { loadSettings, saveSettings } from "./storage";

export interface Position {
  symbol: string;
  direction: "BUY" | "SELL";
  volume: number;       // lots (for display)
  volumeCents: number;  // broker volume unit, needed to close the position
  entryPrice: number;
  openTime: number;
  confidence?: number;  // signal confidence at entry; used for reversal gating
  sl?: number | null;
  tp?: number | null;
}

export interface BotSettings {
  allowedSymbols: string[];
  maxPositions: number;
  dailyLossLimitPercent: number;
  maxDailyLossUSD: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  minHoldSeconds: number;
  lotSize: number;
  symbolLotSize: Record<string, number>;
  dailyProfitCapUSD: number; // lock trading once daily realized profit hits this; 0 = disabled
  capBufferUSD: number; // force-close this many $ BELOW the cap to never overshoot it
  trendLookbackHours: number; // higher-timeframe trend filter lookback; 0 = disabled
  maxConsecutiveLosses: number; // SL hits on one symbol within the window that trigger a cooldown; 0 = disabled
  lossWindowMinutes: number; // window over which SL hits are counted
  cooldownMinutes: number; // how long a symbol stays paused after the streak triggers
}

export interface BotState {
  paused: boolean;
  tradingLocked: boolean;
  dailyRealizedPnL: number;
  dailyPnLSeeded: boolean; // false until broker seed succeeds; limits are skipped until then
  settings: BotSettings;
  positions: Map<number, Position>;
  lastSignalTime: Map<string, number>;
  accountInfo: AccountInfo;
  symbolMap: Map<string, number>;
}

export const DEFAULT_SETTINGS: BotSettings = {
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
  trendLookbackHours: 4,
  maxConsecutiveLosses: 3,
  lossWindowMinutes: 60,
  cooldownMinutes: 120,
};

export const state: BotState = {
  paused: false,
  tradingLocked: false,
  dailyRealizedPnL: 0,
  dailyPnLSeeded: false,
  settings: { ...DEFAULT_SETTINGS },
  positions: new Map(),
  lastSignalTime: new Map(),
  accountInfo: { balance: 0, equity: 0, currency: "USD" },
  symbolMap: new Map(),
};

export interface AccountInfo {
  balance: number;
  equity: number;
  currency: string;
}

export function initSettings(): void {
  const saved = loadSettings();
  if (saved) {
    if (saved.allowedSymbols) state.settings.allowedSymbols = saved.allowedSymbols;
    if (saved.maxPositions) state.settings.maxPositions = saved.maxPositions;
    if (saved.dailyLossLimitPercent !== undefined) state.settings.dailyLossLimitPercent = saved.dailyLossLimitPercent;
    if (saved.maxDailyLossUSD !== undefined) state.settings.maxDailyLossUSD = saved.maxDailyLossUSD;
    if (saved.stopLossPercent !== undefined) state.settings.stopLossPercent = saved.stopLossPercent;
    if (saved.takeProfitPercent !== undefined) state.settings.takeProfitPercent = saved.takeProfitPercent;
    if (saved.minHoldSeconds !== undefined) state.settings.minHoldSeconds = saved.minHoldSeconds;
    if (saved.lotSize !== undefined) state.settings.lotSize = saved.lotSize;
    if (saved.symbolLotSize) state.settings.symbolLotSize = saved.symbolLotSize;
    if (saved.dailyProfitCapUSD !== undefined) state.settings.dailyProfitCapUSD = saved.dailyProfitCapUSD;
    if (saved.capBufferUSD !== undefined) state.settings.capBufferUSD = saved.capBufferUSD;
    if (saved.trendLookbackHours !== undefined) state.settings.trendLookbackHours = saved.trendLookbackHours;
    if (saved.maxConsecutiveLosses !== undefined) state.settings.maxConsecutiveLosses = saved.maxConsecutiveLosses;
    if (saved.lossWindowMinutes !== undefined) state.settings.lossWindowMinutes = saved.lossWindowMinutes;
    if (saved.cooldownMinutes !== undefined) state.settings.cooldownMinutes = saved.cooldownMinutes;
    console.log("[STATE] Loaded saved settings. Allowed symbols:", state.settings.allowedSymbols.length);
  }
}

export function persistSettings(): void {
  saveSettings({
    allowedSymbols: state.settings.allowedSymbols,
    maxPositions: state.settings.maxPositions,
    dailyLossLimitPercent: state.settings.dailyLossLimitPercent,
    maxDailyLossUSD: state.settings.maxDailyLossUSD,
    stopLossPercent: state.settings.stopLossPercent,
    takeProfitPercent: state.settings.takeProfitPercent,
    minHoldSeconds: state.settings.minHoldSeconds,
    lotSize: state.settings.lotSize,
    symbolLotSize: state.settings.symbolLotSize,
    dailyProfitCapUSD: state.settings.dailyProfitCapUSD,
    capBufferUSD: state.settings.capBufferUSD,
    trendLookbackHours: state.settings.trendLookbackHours,
    maxConsecutiveLosses: state.settings.maxConsecutiveLosses,
    lossWindowMinutes: state.settings.lossWindowMinutes,
    cooldownMinutes: state.settings.cooldownMinutes,
  });
}

