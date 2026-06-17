import { state } from "../state";
import { notify } from "../bot/notify";

// Per-symbol consecutive-loss protection. When a symbol takes too many stop-loss
// hits in a short window, the trend has likely turned against the feed's signals,
// so we pause that symbol for a cooldown. Everything here is in-memory — on a
// restart the counters reset, which is fine: the trend filter is the primary
// defense after a restart.

const MIN_MS = 60_000;

// Recent stop-loss timestamps (epoch ms) per symbol, oldest first.
const slHits = new Map<string, number[]>();

interface Cooldown {
  until: number;       // epoch ms when the symbol re-enables
  triggerHits: number; // SL count that triggered it (for logging/status)
}
const cooldowns = new Map<string, Cooldown>();

export interface CooldownInfo {
  symbol: string;
  remainingMs: number;
  hits: number;
}

// Record a stop-loss close for a symbol and start a cooldown if the streak
// threshold is reached within the window.
export function recordStopLoss(symbol: string, time = Date.now()): void {
  const max = state.settings.maxConsecutiveLosses;
  if (max <= 0) return; // protection disabled

  let hits = slHits.get(symbol);
  if (!hits) {
    hits = [];
    slHits.set(symbol, hits);
  }
  hits.push(time);

  // Drop hits older than the counting window.
  const windowMs = state.settings.lossWindowMinutes * MIN_MS;
  while (hits.length && hits[0] < time - windowMs) hits.shift();

  console.log(`[COOLDOWN] ${symbol} SL hit ${hits.length}/${max} within ${state.settings.lossWindowMinutes}m`);

  if (hits.length >= max && state.settings.cooldownMinutes > 0) {
    const until = time + state.settings.cooldownMinutes * MIN_MS;
    cooldowns.set(symbol, { until, triggerHits: hits.length });
    hits.length = 0; // reset the streak; the cooldown now governs this symbol
    const untilStr = new Date(until).toISOString().slice(11, 16);
    console.log(`[COOLDOWN] ${symbol} paused until ${untilStr} UTC (${state.settings.cooldownMinutes}m)`);
    notify(
      `${symbol} cooled down: ${max} stop-losses in ${state.settings.lossWindowMinutes}m. ` +
      `New ${symbol} signals paused for ${state.settings.cooldownMinutes}m (until ${untilStr} UTC). ` +
      `Use /cooldown reset ${symbol} to clear early.`
    );
  }
}

// Active cooldown for a symbol, or null if none / expired. Expired entries are
// cleared lazily on access.
export function getCooldown(symbol: string, now = Date.now()): CooldownInfo | null {
  const cd = cooldowns.get(symbol);
  if (!cd) return null;
  if (now >= cd.until) {
    cooldowns.delete(symbol);
    return null;
  }
  return { symbol, remainingMs: cd.until - now, hits: cd.triggerHits };
}

// All currently-active cooldowns, for /status.
export function activeCooldowns(now = Date.now()): CooldownInfo[] {
  const out: CooldownInfo[] = [];
  for (const [symbol, cd] of cooldowns.entries()) {
    if (now >= cd.until) {
      cooldowns.delete(symbol);
      continue;
    }
    out.push({ symbol, remainingMs: cd.until - now, hits: cd.triggerHits });
  }
  return out;
}

// Manual reset. With a symbol, clears that symbol's cooldown + streak and returns
// 1 if one was active. With no symbol, clears all and returns the count cleared.
export function clearCooldown(symbol?: string): number {
  if (symbol) {
    const had = cooldowns.delete(symbol);
    slHits.delete(symbol);
    return had ? 1 : 0;
  }
  const n = cooldowns.size;
  cooldowns.clear();
  slHits.clear();
  return n;
}
