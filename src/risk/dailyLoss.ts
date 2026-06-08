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