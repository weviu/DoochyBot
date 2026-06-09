import { loadSettings, saveSettings } from "./storage";

export interface Position {
  symbol: string;
  direction: "BUY" | "SELL";
  volume: number;
  entryPrice: number;
  openTime: number;
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
}

export interface BotState {
  paused: boolean;
  tradingLocked: boolean;
  dailyRealizedPnL: number;
  settings: BotSettings;
  positions: Map<number, Position>;
  lastSignalTime: Map<string, number>;
  accountInfo: AccountInfo;
  symbolMap: Map<string, number>;
}

const DEFAULT_SETTINGS: BotSettings = {
  allowedSymbols: ["BTCUSD", "XAUUSD", "XAGUSD"],
  maxPositions: 3,
  dailyLossLimitPercent: 2,
  maxDailyLossUSD: 200,
  stopLossPercent: 0.5,
  takeProfitPercent: 0.75,
  minHoldSeconds: 60,
  lotSize: 0.01,
  symbolLotSize: {},
};

export const state: BotState = {
  paused: false,
  tradingLocked: false,
  dailyRealizedPnL: 0,
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
  });
}

