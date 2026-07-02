import { state } from "../../state";

// Show the user's configured settings (the knobs set via /risk, /minhold, etc.),
// grouped to match the /help categories. Distinct from /status, which shows live
// runtime state (connection, P&L, open positions).
export async function settingsCmd(ctx: any) {
  const s = state.settings;
  const off = "off";

  const lines = [
    "SETTINGS",
    "",
    `Symbols: ${s.allowedSymbols.length ? s.allowedSymbols.join(", ") : "none"}`,
    `Max positions: ${s.maxPositions}`,
    "",
    "Sizing",
    `Per-trade risk: ${s.riskPerTradeUSD > 0 ? `$${s.riskPerTradeUSD}` : "not set (trading off)"}`,
    `Stop loss: ${s.stopLossPercent}% from entry`,
    `Take profit: ${s.takeProfitPercent}% from entry`,
    `Entry tolerance (feed market vs resting order): ${s.entryTolerancePercent > 0 ? `${s.entryTolerancePercent}%` : "off (always market)"}`,
    `Stale-order guard (feed resting orders): ${s.staleOrderBars > 0 ? `${s.staleOrderBars} bars of the signal timeframe` : "off (good-till-cancel)"}`,
    `Min hold before TP: ${s.minHoldSeconds}s`,
    "",
    "Daily limits",
    `Max daily loss: $${s.maxDailyLossUSD}`,
    `Profit cap: ${s.dailyProfitCapUSD > 0 ? `$${s.dailyProfitCapUSD} (buffer $${s.capBufferUSD})` : off}`,
    `Combined risk (same symbol+direction): ${s.maxCombinedRiskUSD > 0 ? `$${s.maxCombinedRiskUSD}` : off}`,
    "",
    "Cooldowns",
    `Consecutive-loss: ${s.maxConsecutiveLosses > 0 ? `${s.maxConsecutiveLosses} SL hits / ${s.lossWindowMinutes}m window -> ${s.cooldownMinutes}m pause` : off}`,
    `Re-entry after a loss: ${s.reentryCooldownMinutes > 0 ? `${s.reentryCooldownMinutes}m` : off}`,
    "",
    `Channel signal confidence: ${s.webhookConfidence}`,
    `Min confidence to open (feed): ${s.minConfidence > 0 ? s.minConfidence : off}`,
    `BTC-bias gate (crypto BUYs): ${s.btcBiasGate ? `on (>=${s.btcBiasMinConfBearish} BEARISH / >=${s.btcBiasMinConfStrongBearish} BEARISH_STRONG)` : off}`,
    `Margin-aware sizing: ${s.marginAware ? "on" : off}`,
    `Order notifications: ${s.notifyFills ? "on" : "off"}`,
  ];

  await ctx.reply(lines.join("\n"));
}
