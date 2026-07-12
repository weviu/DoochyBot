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

async function request<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      // Signed Telegram payload; the server validates it against the bot token.
      Authorization: `tma ${initData()}`,
    },
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
  pause: () => request<{ paused: boolean }>("/pause", "POST"),
  resume: () => request<{ paused: boolean; lockCleared: boolean }>("/resume", "POST"),
  closeall: () => request<{ closed: number; failed: number; total: number }>("/closeall", "POST"),
};
