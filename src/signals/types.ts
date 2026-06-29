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
  // Optional levels the feed itself supplies (e.g. the signal_scanner source).
  // Display-only: surfaced in notifications, never used to place orders.
  sl?: number;
  tp?: number;
  signal_source?: string;
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
  // SL/TP the feed supplied with the alert. Display-only: shown in the signal
  // notification when present, but never fed into order placement or sizing
  // (which stay on the configured stopLossPercent/takeProfitPercent). Kept
  // separate from sl/tp above precisely so execution does not pick them up.
  feedSl?: number;
  feedTp?: number;
  // Where the signal came from, for notifications: "Feed" for the RSI poller, or
  // the channel title for webhook signals from the channel-listener.
  source?: string;
}