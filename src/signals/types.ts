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
  // Order type. Absent/"MARKET" → immediate market fill (the feed's behaviour,
  // unchanged). "LIMIT" with limitPrice → a resting limit order placed by the
  // channel listener; fills only when price reaches limitPrice.
  orderType?: "MARKET" | "LIMIT";
  limitPrice?: number;
  // Where the signal came from, for notifications: "Feed" for the RSI poller, or
  // the channel title for webhook signals from the channel-listener.
  source?: string;
}