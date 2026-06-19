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

// An order that has been submitted to the broker but not yet filled, cancelled,
// or rejected. Tracked so the duplicate gate can reject repeat signals while a
// fill is still outstanding (no Position exists yet at that point).
export interface PendingOrder {
  symbol: string;
  direction: "BUY" | "SELL";
  placedAt: number;
}

export interface BotSettings {
  allowedSymbols: string[];
  maxPositions: number;
  maxDailyLossUSD: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  minHoldSeconds: number;
  riskPerTradeUSD: number; // size each position so a stopLossPercent stop loses ~this many $. Required to trade (0 = trading disabled; there is no fixed-lot fallback).
  dailyProfitCapUSD: number; // lock trading once daily realized profit hits this; 0 = disabled
  capBufferUSD: number; // force-close this many $ BELOW the cap to never overshoot it
  maxConsecutiveLosses: number; // SL hits on one symbol within the window that trigger a cooldown; 0 = disabled
  lossWindowMinutes: number; // window over which SL hits are counted
  cooldownMinutes: number; // how long a symbol stays paused after the streak triggers
  reentryCooldownMinutes: number; // after ANY losing close, block re-entry on the same symbol+direction for this long (prop-firm same-trade-idea rule); 0 = disabled
  maxCombinedRiskUSD: number; // max summed potential loss across all open positions of the same symbol+direction (prop-firm per-trade-idea limit); 0 = disabled
}

export interface BotState {
  paused: boolean;
  tradingLocked: boolean;
  dailyRealizedPnL: number;
  dailyPnLSeeded: boolean; // false until broker seed succeeds; limits are skipped until then
  settings: BotSettings;
  positions: Map<number, Position>;
  pendingOrders: Map<string, PendingOrder>; // keyed by order label, awaiting fill
  lastSignalTime: Map<string, number>;
  accountInfo: AccountInfo;
  symbolMap: Map<string, number>;
  lossReentry: Map<string, number>; // "SYMBOL:DIRECTION" -> epoch ms of the losing close, for the re-entry cooldown
}

export const DEFAULT_SETTINGS: BotSettings = {
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

export const state: BotState = {
  paused: false,
  tradingLocked: false,
  dailyRealizedPnL: 0,
  dailyPnLSeeded: false,
  settings: { ...DEFAULT_SETTINGS },
  positions: new Map(),
  pendingOrders: new Map(),
  lastSignalTime: new Map(),
  accountInfo: { balance: 0, equity: 0, currency: "USD" },
  symbolMap: new Map(),
  lossReentry: new Map(),
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
    if (saved.maxDailyLossUSD !== undefined) state.settings.maxDailyLossUSD = saved.maxDailyLossUSD;
    if (saved.stopLossPercent !== undefined) state.settings.stopLossPercent = saved.stopLossPercent;
    if (saved.takeProfitPercent !== undefined) state.settings.takeProfitPercent = saved.takeProfitPercent;
    if (saved.minHoldSeconds !== undefined) state.settings.minHoldSeconds = saved.minHoldSeconds;
    if (saved.riskPerTradeUSD !== undefined) state.settings.riskPerTradeUSD = saved.riskPerTradeUSD;
    if (saved.dailyProfitCapUSD !== undefined) state.settings.dailyProfitCapUSD = saved.dailyProfitCapUSD;
    if (saved.capBufferUSD !== undefined) state.settings.capBufferUSD = saved.capBufferUSD;
    if (saved.maxConsecutiveLosses !== undefined) state.settings.maxConsecutiveLosses = saved.maxConsecutiveLosses;
    if (saved.lossWindowMinutes !== undefined) state.settings.lossWindowMinutes = saved.lossWindowMinutes;
    if (saved.cooldownMinutes !== undefined) state.settings.cooldownMinutes = saved.cooldownMinutes;
    if (saved.reentryCooldownMinutes !== undefined) state.settings.reentryCooldownMinutes = saved.reentryCooldownMinutes;
    if (saved.maxCombinedRiskUSD !== undefined) state.settings.maxCombinedRiskUSD = saved.maxCombinedRiskUSD;
    console.log("[STATE] Loaded saved settings. Allowed symbols:", state.settings.allowedSymbols.length);
  }
}

export function persistSettings(): void {
  saveSettings({
    allowedSymbols: state.settings.allowedSymbols,
    maxPositions: state.settings.maxPositions,
    maxDailyLossUSD: state.settings.maxDailyLossUSD,
    stopLossPercent: state.settings.stopLossPercent,
    takeProfitPercent: state.settings.takeProfitPercent,
    minHoldSeconds: state.settings.minHoldSeconds,
    riskPerTradeUSD: state.settings.riskPerTradeUSD,
    dailyProfitCapUSD: state.settings.dailyProfitCapUSD,
    capBufferUSD: state.settings.capBufferUSD,
    maxConsecutiveLosses: state.settings.maxConsecutiveLosses,
    lossWindowMinutes: state.settings.lossWindowMinutes,
    cooldownMinutes: state.settings.cooldownMinutes,
    reentryCooldownMinutes: state.settings.reentryCooldownMinutes,
    maxCombinedRiskUSD: state.settings.maxCombinedRiskUSD,
  });
}

