import { state } from "../state";

export function updateDailyPnL(closedPnl: number): void {
  state.dailyRealizedPnL += closedPnl;
  console.log(`[PNL] Updated: ${closedPnl >= 0 ? "+" : ""}${closedPnl.toFixed(2)} (total: ${state.dailyRealizedPnL.toFixed(2)})`);

  const limitPercent = (state.settings.dailyLossLimitPercent / 100) * 10000; // Assume $10k balance for now
  const limitUSD = state.settings.maxDailyLossUSD;
  const maxLoss = Math.min(limitPercent, limitUSD);

  if (state.dailyRealizedPnL < -maxLoss) {
    state.tradingLocked = true;
    console.log(`[PNL] DAILY LOSS LIMIT BREACHED. PnL: ${state.dailyRealizedPnL.toFixed(2)}. Limit: -${maxLoss.toFixed(2)}. Trading locked.`);
  }
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
      state.tradingLocked = false;
      console.log("[PNL] New trading day — P&L and lock reset");
    }
  }, 60_000);
}