import { state, Position } from "../state";
import { ParsedSignal } from "../signals/types";
import { isLocked, evaluateDailyLimits } from "./dailyLoss";
import { getCooldown } from "./cooldown";
import { executeSignal } from "../ctrader/orders";
import { executeReversal } from "./reversal";

// Outcome of running a signal through the gate. The poller ignores this; the
// webhook uses it to tell the caller whether the signal executed or why it was
// rejected. Gate logic and logging below are unchanged.
export interface GateResult {
  accepted: boolean;
  reason?: string;
}

export function processSignal(signal: ParsedSignal): GateResult {
  // Check 1: Trading paused?
  if (state.paused) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Trading paused`);
    return { accepted: false, reason: "Trading paused" };
  }

  // Check 2: Symbol on the allowed list?
  if (!state.settings.allowedSymbols.includes(signal.symbol)) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Not in allowed symbols`);
    return { accepted: false, reason: "Not in allowed symbols" };
  }

  // Check 2b: Symbol available on this broker?
  const resolvable = state.symbolMap.has(signal.symbol) || state.symbolMap.has(signal.symbol.replace(/USD$/, ""));
  if (!resolvable) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Not available on broker`);
    return { accepted: false, reason: "Not available on broker" };
  }

  // Check 3: Per-symbol consecutive-loss cooldown.
  const cooldown = getCooldown(signal.symbol);
  if (cooldown) {
    const minsLeft = Math.ceil(cooldown.remainingMs / 60_000);
    const until = new Date(Date.now() + cooldown.remainingMs).toISOString().slice(11, 16);
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Cooldown after ${cooldown.hits} SL hits, ${minsLeft}m left (until ${until} UTC)`);
    return { accepted: false, reason: `Cooldown after ${cooldown.hits} SL hits, ${minsLeft}m left (until ${until} UTC)` };
  }

  // Check 4: One position per symbol. Runs before the max-positions check so a
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
    // Same direction — never stack duplicates.
    if (existing.direction === signal.direction) {
      console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Already holding ${existing.direction}`);
      return { accepted: false, reason: `Already holding ${existing.direction}` };
    }

    // Opposite direction — flip only if the new signal is more confident.
    const newConf = signal.confidence ?? 0;
    const oldConf = existing.confidence ?? 0;
    if (newConf <= oldConf) {
      console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Confidence too low (${newConf} vs existing ${oldConf})`);
      return { accepted: false, reason: `Confidence too low (${newConf} vs existing ${oldConf})` };
    }

    console.log(`[GATE] Reversal: closing ${existing.direction} ${signal.symbol} (conf ${oldConf}) for ${signal.direction} (conf ${newConf})`);
    executeReversal(existingId, existing, signal).catch((err) => {
      console.log(`[REVERSAL] Unhandled error for ${signal.symbol}: ${err.message}`);
    });
    return { accepted: true, reason: "Reversal: flipped existing position" };
  }

  // Check 4b: An order for this symbol+direction is already placed but not yet
  // filled. The duplicate check (Check 7) only looks at executed signals, and
  // Check 4 only looks at open positions — neither sees an order still awaiting
  // fill. Without this, a signal that keeps re-arriving submits a fresh order
  // every cycle while the prior ones sit pending at the broker.
  for (const pending of state.pendingOrders.values()) {
    if (pending.symbol === signal.symbol && pending.direction === signal.direction) {
      console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} — Order already pending fill`);
      return { accepted: false, reason: "Order already pending fill" };
    }
  }

  // Check 5: Max positions reached?
  if (state.positions.size >= state.settings.maxPositions) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Max positions (${state.settings.maxPositions})`);
    return { accepted: false, reason: `Max positions (${state.settings.maxPositions})` };
  }

  // Check 6: Trading locked by a daily limit (loss limit or profit cap)?
  evaluateDailyLimits(true);
  if (isLocked()) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Daily limit reached (trading locked)`);
    return { accepted: false, reason: "Daily limit reached (trading locked)" };
  }

  // Check 7: Duplicate signal within 60s?
  const signalKey = `${signal.symbol}:${signal.direction}`;
  const lastTime = state.lastSignalTime.get(signalKey);
  const now = Date.now();
  if (lastTime && (now - lastTime) < 60_000) {
    console.log(`[GATE] Rejected: ${signal.direction} ${signal.symbol} - Duplicate within 60s`);
    return { accepted: false, reason: "Duplicate within 60s" };
  }

  state.lastSignalTime.set(signalKey, now);
  console.log(`[GATE] Passed: ${signal.direction} ${signal.symbol}`);
  executeSignal(signal).catch((err) => {
    console.log(`[ORDER] Unhandled error for ${signal.symbol}: ${err.message}`);
  });
  return { accepted: true };
}
