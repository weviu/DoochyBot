import { state, Position } from "../state";
import { ParsedSignal } from "../signals/types";
import { isLocked } from "./dailyLoss";
import { executeSignal } from "../ctrader/orders";
import { executeReversal } from "./reversal";

export function processSignal(signal: ParsedSignal): void {
  // Check 1: Trading paused?
  if (state.paused) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Trading paused`);
    return;
  }

  // Check 2: Symbol available on this broker? The signal feed covers many
  // altcoins this account simply doesn't list, so they can't be traded.
  const resolvable = state.symbolMap.has(signal.symbol) || state.symbolMap.has(signal.symbol.replace(/USD$/, ""));
  if (!resolvable) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Not available on broker`);
    return;
  }

  // Check 3: One position per symbol. Runs before the max-positions check so a
  // valid reversal (which closes one and opens one — net zero) is never blocked
  // by being at the position cap.
let existingId: number | null = null;
let existing: Position | null = null;
for (const [id, pos] of state.positions.entries()) {
  if (pos.symbol === signal.symbol) {
    existingId = id;
    existing = pos;
    break;
  }
}

if (existing && existingId !== null) {
  // Case A: same direction — never stack duplicates.
  if (existing.direction === signal.direction) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Already holding ${existing.direction}`);
    return;
  }

  // Case B: opposite direction — flip only if the new signal is more confident.
  const newConf = signal.confidence ?? 0;
  const oldConf = existing.confidence ?? 0;
  if (newConf <= oldConf) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Confidence too low (${newConf} vs existing ${oldConf})`);
    return;
  }

  console.log(`[GATE] Reversal: closing ${existing.direction} ${signal.symbol} (conf ${oldConf}) for ${signal.direction} (conf ${newConf})`);
  executeReversal(existingId, existing, signal).catch((err) => {
    console.log(`[REVERSAL] Unhandled error for ${signal.symbol}: ${err.message}`);
  });
  return;
}

// Check 4: Max positions reached? (Only new symbols reach here — reversals
// already returned above.)
if (state.positions.size >= state.settings.maxPositions) {
  console.log(
    `[GATE] Rejected: ${signal.direction} ${signal.symbol} - Max positions (${state.settings.maxPositions})`
  );
  return;
}

// Check 5: Trading locked by daily loss limit?
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