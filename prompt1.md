The setConnection pattern was the right call — it avoids the circular dependency that plagues most cTrader bots. Phase 2 gives you a working signal-to-execution pipeline.

---

## PHASE 3: SL/TP Amendment + Daily Loss Lock + Position Tracking

---

Add SL/TP amendment after order fill, daily loss tracking with auto-lock, and the reversal check to DoochyBot at /home/san/DoochyBot/.

WHAT TO BUILD

1. src/ctrader/amend.js

Export a function amendPositionSLTP(positionId, symbol, entryPrice, direction, signal) that sets stop loss and take profit on a filled position.

The function determines SL and TP based on state.settings.sltpMode:

Mode "auto":
- If signal.sl is not null and signal.tp is not null: use them directly. Log "Using signal SL/TP: sl=0.1610, tp=0.1700"
- If either is null: fall back to dollar mode for that value

Mode "dollar":
- SL = calculate from state.settings.stopLossUSD or state.settings.symbolStopLossUSD[symbol]
- TP = calculate from state.settings.takeProfitUSD or state.settings.symbolTakeProfitUSD[symbol]
- Dollar-to-price conversion: priceDistance = dollarAmount / (volume × contractSize × 0.01)
- For BUY: sl = entryPrice - slDistance, tp = entryPrice + tpDistance
- For SELL: sl = entryPrice + slDistance, tp = entryPrice - tpDistance
- Log "Dollar SL/TP: sl=0.1610 ($30.00), tp=0.1700 ($45.00)"

Mode "pivot":
- Trust signal.sl and signal.tp completely. If they're null, skip SL/TP for that value.
- Log "Pivot SL/TP: sl=0.1610, tp=0.1700"

Symbol-specific overrides:
- Check state.settings.symbolStopLossUSD — if the symbol has a specific SL dollar amount, it overrides the global stopLossUSD
- Same for symbolTakeProfitUSD
- These are checked in dollar mode and when auto mode falls back to dollar

Min hold timer:
- SL is set immediately after fill (always)
- TP is delayed by state.settings.minHoldSeconds (default 60 seconds)
- After the minHoldSeconds delay, send the TP amendment
- If the position was already closed during the waiting period: cancel the delayed TP, log "TP skipped — position closed during min hold"
- Log: "SL set immediately. TP will be set in 60s (min hold)"

ProtoOAAmendPositionSLTPReq:
- ctidTraderAccountId from .env
- positionId: the position ID from the fill
- stopLoss: the calculated SL price (only include if not null)
- takeProfit: the calculated TP price (only include if not null)
- Wait for the amendment confirmation. The library may return immediately or via event.
- If amendment succeeds: update the position in state.positions with sl and tp values. Log "SL/TP set: sl=0.1610, tp=0.1700"
- If amendment fails: log "SL/TP amendment failed: error message". Do NOT close the position — it stays open without SL/TP. The user must manually manage it.

Edge cases:
- If SL would be on the wrong side of entry (SL above entry for BUY, below for SELL): log error, skip SL
- If TP would be on the wrong side: log error, skip TP
- If entryPrice is 0 or null: log error, skip amendment entirely

2. Update src/ctrader/orders.js

After the order fills and we have positionId and openPrice, call amendPositionSLTP:

- Import amendPositionSLTP from ./amend.js
- Call it with the filled position details and the original signal
- Do NOT await the TP delay — let the amend module handle the 60s timer internally
- The executeSignal function returns success once the SL is set (not waiting for TP)

3. src/risk/dailyLoss.js

Export two functions:

checkDailyLoss():
- Calculate: dailyLossLimit = state.accountInfo.balance × (state.settings.dailyLossLimitPercent / 100)
- Convert to absolute: maxLoss = Math.min(dailyLossLimit, state.settings.maxDailyLossUSD) — whichever is smaller
- If state.dailyRealizedPnL < -maxLoss: set state.tradingLocked = true, log "DAILY LOSS LIMIT BREACHED. P&L: -$X.XX. Limit: -$Y.YY. Trading locked.", return true
- Otherwise: return false

This is called after each position close (see below). It can also be called by a periodic check.

updateDailyPnL(closedPnl):
- Add closedPnl to state.dailyRealizedPnL
- Log "Daily P&L updated: +$X.XX (total: +$Y.YY)"
- Then call checkDailyLoss()
- If checkDailyLoss returns true: log "Trading locked for the day. Use /pnl reset to unlock (if limit was raised)."

4. Position close tracking

The cTrader connection already forwards ProtoOAExecutionEvent. We need to listen for position closes.

In src/startup.js or a new file src/ctrader/events.js:

Add a listener on the connection for ProtoOAExecutionEvent where executionType is "ORDER_FILLED" and the order is a closing order (closingOrder: true, or the deal has closePositionDetail).

When a position is closed:
- Find the position in state.positions by positionId
- Calculate P&L: if closePositionDetail exists, use grossProfit. Otherwise: (exitPrice - entryPrice) × volume × contractSize for BUY, reversed for SELL
- Remove the position from state.positions
- Call updateDailyPnL(pnl)
- Log "Position closed: BUY ADAUSD #7390876 | P&L: +$15.95"
- Call appendTrade to record the closed trade with exit price and P&L

If the position is not in state.positions (closed externally or restarted): still call updateDailyPnL but log "External close detected: position #7390876"

5. src/risk/reversal.js

Export a function checkReversal(signal) that checks if the new signal is opposite to an existing position on the same symbol.

Logic:
- Look for an open position in state.positions where position.symbol === signal.symbol AND position.direction !== signal.direction
- If no opposite position: return { isReversal: false }
- If opposite position found: return { isReversal: true, existingPosition }

This is called by processSignal in gate.js BEFORE the max positions check. If it's a reversal, the max positions check is skipped (we're flipping, not adding).

The reversal execution (closing old + opening new) is handled in Phase 4. For now, just detect it and log "Reversal signal detected: SELL ADAUSD would close existing BUY #7390876". Pass the signal to executeSignal as normal — the reversal handling (close then open) comes next.

6. Update src/risk/gate.js

In processSignal, before Check 3 (max positions):
- Call checkReversal(signal)
- If isReversal: skip Check 3 (max positions). The reversal will close one and open one — net zero change.
- If not reversal: continue to Check 3 as before
- After all checks pass: call executeSignal(signal)

7. Update src/index.js

After runStartup:
- Set up the position close listener (from step 4 above) on the connection
- Call startPoller()
- Log "DoochyBot ready"

TESTING

1. Place a trade that fills. Within 30 seconds, the SL should appear on the position in cTrader.
2. After 60 seconds, the TP should appear.
3. Close a position manually in cTrader. The bot should detect it, calculate P&L, update daily P&L, and log it.
4. When daily P&L goes below the limit, trading should lock. Subsequent signals should be rejected with "Trading locked".
5. Send a signal opposite to an open position. The log should show "Reversal signal detected".

IMPORTANT

- The minHoldSeconds timer for TP must not block the bot. Use setTimeout — do NOT await it in the main execution flow.
- If the bot restarts during the 60s TP delay, the TP is not set. This is acceptable — the position sync on restart will show the position without TP, and the user can set it manually or close it.
- Dollar-to-price conversion uses the contractSize from state.symbolMap. If not found, fall back to 100000.
- All monetary values are in the account currency (USD for prop firms).
- Position close events might arrive as ProtoOAExecutionEvent with executionType "ORDER_FILLED" where the order has closingOrder: true. Check this flag. Also check if deal.closePositionDetail exists as an alternative detection method.
- Use the existing state, storage, and connection modules. Do not duplicate functionality.