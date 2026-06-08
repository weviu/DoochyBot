import { RawAlert, ParsedSignal } from "./types";

const SYMBOL_ALIASES: Record<string, string> = {
  AAVE: "AAVUSD",
  ALGO: "ALGUSD",
  AVAX: "AVAUSD",
  LINK: "LNKUSD",
};

function resolveSymbol(raw: string): string | null {
  const base = raw.split("/")[0].toUpperCase();
  if (!base) return null;
  return SYMBOL_ALIASES[base] || `${base}USD`;
}

export function parseSignal(alert: RawAlert): ParsedSignal | null {
  const symbol = resolveSymbol(alert.symbol);
  if (!symbol) return null;

  const dir = alert.direction.toUpperCase();
  if (dir !== "BUY" && dir !== "SELL") return null;

  return {
    symbol,
    direction: dir,
    rsi: alert.rsi,
    price: alert.price,
    pivotLevel: alert.pivot_level,
    pivotDistance: alert.pivot_distance,
    confidence: alert.confidence ?? 0,
    timeframe: alert.timeframe,
    timestamp: alert.timestamp,
  };
}