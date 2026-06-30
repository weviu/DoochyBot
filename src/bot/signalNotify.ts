import { state, slPctFor, tpPctFor } from "../state";
import { ParsedSignal } from "../signals/types";
import { notify } from "./notify";

// Notify on every incoming signal (whether or not the gate executes it), so the
// user can act on it manually when trading somewhere other than cTrader. Fires
// only when signalNotify is on and the signal scores at least
// signalNotifyMinConfidence. Independent of the execution path and the entry
// gate. Called once per signal at the top of the gate, before any rejection.
export function maybeNotifySignal(signal: ParsedSignal): void {
  if (!state.settings.signalNotify) return;

  const conf = signal.confidence ?? 0;
  if (conf < state.settings.signalNotifyMinConfidence) return;

  // Green orb for buys, red orb for sells, per request.
  const orb = signal.direction === "BUY" ? "\u{1F7E2}" : "\u{1F534}";

  // SL/TP to display, in priority order:
  //  1. signal.sl/tp   - explicit levels on a channel signal (drive execution).
  //  2. feedSl/feedTp  - levels the feed supplied (display-only; execution still
  //                      uses the configured percentages, so these never reach
  //                      order placement - see ParsedSignal.feedSl).
  //  3. derived        - same formula order placement uses (orders.ts): the
  //                      would-be entry price and the per-symbol SL/TP percent.
  // A LIMIT order would enter at limitPrice, otherwise the signal's market price.
  const entry = signal.orderType === "LIMIT" && signal.limitPrice != null ? signal.limitPrice : signal.price;
  const slPct = slPctFor(signal.symbol);
  const tpPct = tpPctFor(signal.symbol);
  const slP = signal.sl ?? signal.feedSl ?? (entry ? (signal.direction === "BUY" ? entry * (1 - slPct / 100) : entry * (1 + slPct / 100)) : undefined);
  const tpP = signal.tp ?? signal.feedTp ?? (entry ? (signal.direction === "BUY" ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100)) : undefined);
  // Match SL/TP precision to the entry price's decimal places.
  const digits = ((entry ?? 0).toString().split(".")[1] || "").length || 2;
  const fmt = (n: number | undefined) => (n != null ? n.toFixed(digits) : "-");

  // Fields in the requested order, always present so every notification has the
  // same shape: symbol, confidence, direction, price, sl, tp, signal source.
  // The orb stays on the direction line as the colour cue.
  const lines = [
    signal.symbol,
    `Confidence: ${conf}`,
    `${orb} ${signal.direction}`,
    `Price: ${signal.price || "-"}`,
  ];
  if (signal.orderType === "LIMIT" && signal.limitPrice != null) lines.push(`Limit: ${signal.limitPrice}`);
  lines.push(`SL: ${fmt(slP)}`);
  lines.push(`TP: ${fmt(tpP)}`);
  // BTC macro state, for crypto only. Null/absent (gold, silver, forex, indices)
  // omits the line entirely rather than showing a meaningless "n/a".
  if (signal.btcState) lines.push(`BTC: ${signal.btcState}`);
  lines.push(`Source: ${signal.source || "Unknown"}`);

  notify(lines.join("\n")).catch(() => {});
}
