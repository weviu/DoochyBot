import { initData } from "./telegram";

// Shapes mirror the backend (src/bot/commands/status.ts, positions.ts).
export interface StatusData {
  connected: boolean;
  accountId: string;
  balance: number;
  currency: string;
  paused: boolean;
  locked: boolean;
  openPositions: number;
  maxPositions: number;
  dailyRealizedPnL: number;
  floatingPnL: number;
  profitCapUSD: number;
  capUsed: number;
  maxLossUSD: number;
  riskPerTradeUSD: number;
  minConfidence: number;
  btcBiasGate: boolean;
  marginAware: boolean;
  allowedSymbols: string[];
  cooldowns: { symbol: string; remainingMs: number }[];
}

export interface PositionRow {
  posId: number;
  direction: "BUY" | "SELL";
  symbol: string;
  volume: number;
  entryPrice: number;
  mark: number;
  sl: number | null;
  tp: number | null;
  pnl: number;
  timeExitMinLeft: number | null;
}

export interface PositionsData {
  positions: PositionRow[];
  totalPnL: number;
}

// The full agent-side settings object (src/state.ts BotSettings). Every field is
// editable from the panel by relaying the matching Telegram command.
export interface Settings {
  allowedSymbols: string[];
  maxPositions: number;
  maxDailyLossUSD: number;
  minHoldSeconds: number;
  riskPerTradeUSD: number;
  riskOverrunPercent: number;
  dailyProfitCapUSD: number;
  capBufferUSD: number;
  maxConsecutiveLosses: number;
  lossWindowMinutes: number;
  cooldownMinutes: number;
  reentryCooldownMinutes: number;
  maxCombinedRiskUSD: number;
  notifyFills: boolean;
  signalNotify: boolean;
  signalNotifyMinConfidence: number;
  webhookConfidence: number;
  minConfidence: number;
  staleOrderBars: number;
  marginAware: boolean;
  btcBiasGate: boolean;
  btcBiasMinConfBearish: number;
  btcBiasMinConfStrongBearish: number;
}

// A command relay always returns the display text plus a fresh settings
// snapshot, so the panel can refresh its forms from the authoritative agent
// state after every change.
export interface CommandResult {
  text: string;
  settings: Settings | null;
}

async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      // Signed Telegram payload; the server validates it against the bot token.
      Authorization: `tma ${initData()}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<StatusData>("/status"),
  positions: () => request<PositionsData>("/positions"),
  settings: () => request<Settings>("/settings"),
  pause: () => request<{ paused: boolean }>("/pause", "POST"),
  resume: () => request<{ paused: boolean; lockCleared: boolean }>("/resume", "POST"),
  closeall: () => request<{ closed: number; failed: number; total: number }>("/closeall", "POST"),
  // Run a Telegram command (e.g. command("risk", ["pertrade", "50"])) through
  // the agent and get back its reply text and refreshed settings.
  command: (cmd: string, args: string[] = []) =>
    request<CommandResult>("/command", "POST", { cmd, args }),
};
