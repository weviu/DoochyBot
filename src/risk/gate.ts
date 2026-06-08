import { state } from "../state";
import { ParsedSignal } from "../signals/types";
import { isLocked } from "./dailyLoss";
import { executeSignal } from "../ctrader/orders";

export function processSignal(signal: ParsedSignal): void {
  // Check 1: Trading paused?
  if (state.paused) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Trading paused`);
    return;
  }

  // Check 2: Symbol available on cTrader?
  const resolvable = state.symbolMap.has(signal.symbol) || state.symbolMap.has(signal.symbol.replace(/USD$/, ""));
  if (!resolvable) {
    return;
  }

  // Check 3: Max positions reached?
if (state.positions.size >= state.settings.maxPositions) {
  console.log(
    `[GATE] Rejected: ${signal.direction} ${signal.symbol} - Max positions (${state.settings.maxPositions})`
  );
  return;
}

// Check 4: Trading locked by daily loss limit?
if (isLocked()) {
  console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} -   Daily loss limit reached`);
  return;
}

// Check 5: Duplicate signal within 60s?
const signalKey = `${signal.symbol}:${signal.direction}`;
const lastTime = state.lastSignalTime.get(signalKey);
const now = Date.now();

if (lastTime && (now - lastTime) < 60_000) {
  console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Duplicate within 60s`);
  return;
}

state.lastSignalTime.set(signalKey, now);

console.log(`[GATE] Passed: ${signal.direction} ${signal.symbol}`);
executeSignal(signal).catch((err) => {
  console.log(`[ORDER] Unhandled error for ${signal.symbol}: ${err.message}`);
});
}