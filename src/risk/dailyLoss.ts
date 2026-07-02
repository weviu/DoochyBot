import { state, setTradingLock, isUsdQuoted } from "../state";
import { notify } from "../bot/notify";
import { getMarkPrice } from "../ctrader/livePrices";

// The hard daily loss threshold in USD. Single source of truth, set via
// /risk maxloss. (The old percent-based limit was removed — it duplicated this
// and was computed off a hardcoded $10k balance, which was misleading.)
export function maxLossUSD(): number {
  return state.settings.maxDailyLossUSD;
}

// Sum of unrealized P&L across all open positions. Uses the live cTrader spot
// price (authoritative, matches the broker's Net USD) and only falls back to the
// stale HTTP-feed price if no spot quote has arrived for that symbol yet.
// Approximation: no quote-to-USD conversion, accurate enough for XAUUSD/BTCUSD.
export function floatingPnL(): number {
  let total = 0;
  for (const pos of state.positions.values()) {
    // Belt-and-braces: the money model below assumes a USD quote currency. Only
    // value a position that is BOTH an allowed symbol AND actually USD-quoted — a
    // JPY/GBP-quoted pair (even one mistakenly on the allowed list) would be
    // overstated by ~its cross rate and could trip the daily-loss limit.
    if (!state.settings.allowedSymbols.includes(pos.symbol)) continue;
    if (!isUsdQuoted(pos.symbol)) continue;
    const mark = getMarkPrice(pos.symbol, pos.direction);
    if (!mark || !pos.entryPrice) continue;
    const diff = pos.direction === "BUY" ? mark - pos.entryPrice : pos.entryPrice - mark;
    total += diff * (pos.volumeCents / 100);
  }
  return total;
}

// If a daily limit is currently breached, return a human-readable reason for the
// lock; otherwise null. The profit cap uses realized + floating so an account
// already at +$390 realized won't open more positions while floating +$50.
// The loss limit stays realized-only — unrealized dips shouldn't lock you out.
function breachedLimit(): string | null {
  const cap = state.settings.dailyProfitCapUSD;
  if (cap > 0) {
    const total = state.dailyRealizedPnL + floatingPnL();
    if (total >= cap) {
      return `Daily profit cap reached: +${total.toFixed(2)} USD (cap ${cap.toFixed(2)})`;
    }
  }
  const loss = maxLossUSD();
  const totalPnL = state.dailyRealizedPnL + floatingPnL();
  if (totalPnL < -loss) {
    return `Daily loss limit hit: ${totalPnL.toFixed(2)} USD (limit -${loss.toFixed(2)})`;
  }
  return null;
}

// Re-check the daily limits against current realized P&L and lock trading if a
// limit is breached. Called after each close and once at boot. When `announce`
// is set, pushes a Telegram alert on the transition into a locked state.
export function evaluateDailyLimits(announce: boolean): void {
  // Never check limits against an unseeded counter — a failed seed leaves the
  // counter at 0, which would false-trigger the loss limit as soon as any
  // position closes at a loss within the session.
  if (!state.dailyPnLSeeded) {
    console.warn("[PNL] Skipping limit check — daily P&L not seeded from broker yet");
    return;
  }
  const reason = breachedLimit();
  if (!reason) return;
  const wasLocked = state.tradingLocked;
  setTradingLock(true);
  console.log(`[PNL] Trading locked - ${reason}`);
  if (announce && !wasLocked) {
    notify(`${reason}. New signals are blocked until midnight UTC or /resume.`);
  }
}

export function updateDailyPnL(closedPnl: number): void {
  state.dailyRealizedPnL += closedPnl;
  console.log(`[PNL] Updated: ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} (total: ${state.dailyRealizedPnL.toFixed(2)})`);
  evaluateDailyLimits(true);
}

export function isLocked(): boolean {
  return state.tradingLocked;
}

// At 00:00 UTC, start a fresh trading day: zero the realized P&L and clear the
// daily-loss trading lock. Fires once per day.
export function startDailyReset(): void {
  let resetToday = false;
  let lastDay = new Date().getUTCDate();

  setInterval(() => {
    const now = new Date();
    const day = now.getUTCDate();
    if (day !== lastDay) {
      lastDay = day;
      resetToday = false;
    }

    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && !resetToday) {
      resetToday = true;
      state.dailyRealizedPnL = 0;
      state.dailyPnLSeeded = true; // we just set it to 0 - that is the correct value
      setTradingLock(false);
      console.log("[PNL] New trading day - P&L and lock reset");
    }
  }, 60_000);
}