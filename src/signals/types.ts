export interface RawAlert {
  timestamp: string;
  symbol: string;
  timeframe: string;
  direction: string;
  rsi: number;
  price: number;
  pivot_level: string | null;
  pivot_distance: number | null;
  confidence?: number;
}

export interface ParsedSignal {
  symbol: string;
  direction: "BUY" | "SELL";
  rsi: number;
  price: number;
  pivotLevel: string | null;
  pivotDistance: number | null;
  confidence: number;
  timeframe: string;
  timestamp: string;
  sl?: number;
  tp?: number;
}