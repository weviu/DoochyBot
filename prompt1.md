## PHASE 4: Telegram Bot + Commands

---

Add the Telegram interface to DoochyBot at /home/san/DoochyBot/. The bot uses grammY. All state is already in memory via src/state.js — commands read and write that state directly.

WHAT TO BUILD

1. src/bot/bot.js

Create and export the grammY bot instance.

Setup:
- Import { Bot } from "grammY"
- Create bot with TELEGRAM_BOT_TOKEN from config
- Restrict to ALLOWED_USERS: if the env var is set, parse the comma-separated list of user IDs. In the bot's middleware, check ctx.from.id against the list. If not allowed, reply "Unauthorized" and return immediately. If ALLOWED_USERS is empty, allow everyone.
- Register all command handlers (listed below)
- Start the bot with bot.start()
- Log "Telegram bot started. Allowed users: X"

Export the bot instance so other modules can send messages (for alerts).

2. Command handlers

Each command is a separate file in src/bot/commands/. Every command handler receives (ctx, state) — ctx is the grammY context, state is the in-memory state object.

/start
File: src/bot/commands/start.js
- Reply: "DoochyBot ready. Send /help for commands."

/help
File: src/bot/commands/help.js
- List all commands with one-line descriptions:

/status — Account and position summary
/balance — Account balance and margin
/positions — List open positions
/pause — Stop executing new signals
/resume — Resume executing signals
/closeall — Close all open positions
/risk daily <percent> — Set daily loss limit (%)
/risk size <symbol> <lots> — Set lot size
/risk mode <fixed|percent> — Set sizing mode
/risk percent <percent> — Set risk per trade (%)
/risk sltp <auto|dollar|pivot> — Set SL/TP mode
/risk minhold <seconds> — Set min hold time
/symbols — List allowed symbols
/symbols add <symbol> <lots> — Add symbol
/symbols remove <symbol> — Remove symbol
/confirm <on|off> — Toggle auto-execute
/export — Export trade history

/status
File: src/bot/commands/status.js
- Show: connection status, daily P&L, number of open positions, trading paused/locked state
- Format:
```
DoochyBot Status
Daily P&L: +$45.32 (limit: -$200.00)
Open positions: 3/5
Trading: ACTIVE
Mode: fixed lots | SL/TP: auto
```

/balance
File: src/bot/commands/balance.js
- Show from state.accountInfo: equity, balance, margin, freeMargin
- Format:
```
Balance: $10,000.00
Equity: $9,982.00
Margin: $18.00
Free Margin: $9,964.00
```

/positions
File: src/bot/commands/positions.js
- List all positions from state.positions
- For each: direction, volume, symbol, entryPrice, current P&L (if we have current price, otherwise show entry only), SL, TP
- Format: "BUY 0.1 ADAUSD @ 0.1644 | SL: 0.1610 | TP: 0.1700"
- If no positions: "No open positions"
- Current price: if we don't have live prices, just show entry and skip P&L

/pause
File: src/bot/commands/pause.js
- Set state.paused = true
- Reply: "Trading paused. Use /resume to re-enable."

/resume
File: src/bot/commands/resume.js
- Set state.paused = false
- Reply: "Trading resumed."

/closeall
File: src/bot/commands/closeall.js
- If no positions: "No positions to close"
- If positions exist: "Closing X positions..."
- For each position in state.positions: send ProtoOAPositionCloseReq with positionId and volume
- Wait for each fill (or fire and forget — log results)
- Reply: "Closed X positions. Failed: Y"
- On failure for a position: log which position failed and why
- Clear state.positions after all closes are confirmed

/risk
File: src/bot/commands/risk.js
Handle subcommands:

/risk daily <percent>
- Update state.settings.dailyLossLimitPercent = parseFloat(percent)
- Call storage.saveSettings({ dailyLossLimitPercent: percent })
- Reply: "Daily loss limit: X%"

/risk size <symbol> <lots>
- Update state.settings.lotSizes[symbol] = parseFloat(lots)
- Call storage.saveSettings with updated lotSizes
- Reply: "Lot size: SYMBOL = X lots"

/risk mode fixed
- state.settings.riskMode = "fixed"
- storage.saveSettings({ riskMode: "fixed" })
- Reply: "Sizing mode: fixed lots"

/risk mode percent
- state.settings.riskMode = "percent"
- storage.saveSettings({ riskMode: "percent" })
- Reply: "Sizing mode: percent of equity (SL required)"

/risk percent <percent>
- state.settings.riskPercent = parseFloat(percent)
- storage.saveSettings({ riskPercent: percent })
- Reply: "Risk per trade: X%"

/risk sltp auto
/risk sltp dollar
/risk sltp pivot
- Update state.settings.sltpMode
- storage.saveSettings
- Reply with current mode and a brief explanation of what it does

/risk minhold <seconds>
- state.settings.minHoldSeconds = parseInt(seconds)
- storage.saveSettings({ minHoldSeconds: seconds })
- Reply: "Min hold time: Xs (TP delayed by this amount)"

/symbols
File: src/bot/commands/symbols.js

/symbols (no args)
- List all allowed symbols with lot sizes
- Format: "BTCUSD: 0.05 | XAUUSD: 0.05 | ADAUSD: 0.1"

/symbols add <symbol> <lots>
- Add to state.settings.allowedSymbols (if not already there)
- Set state.settings.lotSizes[symbol] = parseFloat(lots)
- storage.saveSettings
- Reply: "Added SYMBOL (X lots)"

/symbols remove <symbol>
- Remove from allowedSymbols and lotSizes
- storage.saveSettings
- Reply: "Removed SYMBOL"

/confirm
File: src/bot/commands/confirm.js

/confirm on
- state.settings.confirmMode = true
- storage.saveSettings({ confirmMode: true })
- Reply: "Confirmation mode ON — signals require approval before execution"

/confirm off
- state.settings.confirmMode = false
- storage.saveSettings({ confirmMode: false })
- Reply: "Confirmation mode OFF — signals execute automatically"

/export
File: src/bot/commands/export.js

/export (no args) — export last 7 days
/export 2026-06-01 — from June 1st to now
/export 2026-06-01 2026-06-05 — date range
/export 2026-06-01_12:30 2026-06-05_23:59 — with time

Logic:
- Read data/tradeLog.jsonl
- Parse each line as JSON
- Filter by date range
- Format as readable text:
```
TRADE HISTORY
=============
Period: 2026-06-01 to 2026-06-07
Trades: 48 (48 closed)
Realized P&L: +$244.46

#1 BUY 0.1 ADAUSD [CLOSED] (#7390876)
   Opened: 2026-06-05 11:17
   Closed: 2026-06-05 12:11 (54m)
   Entry → Exit: 0.1644 → 0.1614
   P&L: -$31.05
...
```
- If the message is too long for Telegram (over 4096 chars): split into multiple messages
- If no trades in range: "No trades found for this period"
- If tradeLog.jsonl doesn't exist: "No trade history yet"

3. Alerts to Telegram

When certain events happen, send a message to the user's Telegram chat.

For this, we need to know the chat ID. Add a command /setchatid:
File: src/bot/commands/setchatid.js
- Save ctx.chat.id to state.settings.chatId
- storage.saveSettings({ chatId: ctx.chat.id })
- Reply: "Chat ID saved. Alerts will be sent here."

Alert events (send to state.settings.chatId if set):
- Daily loss limit breached: "Daily loss limit reached. Trading locked."
- Position closed: "ADAUSD SELL closed | P&L: +$15.95 | Daily P&L: +$45.32"
- Order filled: "BUY 0.1 ADAUSD filled @ 0.1644 | Position #7390876"
- These use bot.api.sendMessage(chatId, message). Import the bot instance from bot.js.

Where to trigger alerts:
- In events.js when a position close is detected: send the closed alert
- In orders.js when a fill is confirmed: send the filled alert
- In dailyLoss.js when trading is locked: send the limit breached alert

4. Register all commands in bot.js

Import each command handler and register it:
- bot.command("start", (ctx) => startCmd(ctx, state))
- bot.command("help", (ctx) => helpCmd(ctx, state))
- ... all others
- Use bot.command() for each. grammY handles the parsing.

For commands with subcommands (/risk daily, /risk size, /symbols add, etc.): parse ctx.message.text within the handler. Split by spaces, dispatch to the right sub-handler.

For /export with optional args: parse the rest of the message after the command.

5. Wire into index.js

After runStartup and poller start:
- Import and call the bot setup from src/bot/bot.js
- Pass the state object to the bot setup
- The bot setup registers all commands and starts the bot
- Log "Telegram bot started"

TESTING

1. Send /help to the bot — should list all commands
2. Send /status — should show daily P&L, positions, trading state
3. Send /symbols — should show allowed symbols with lot sizes
4. Send /symbols add ADAUSD 0.1 — should add ADAUSD
5. Send /risk daily 2 — should update limit
6. Send /pause — should lock trading. Verify by checking /status
7. Send /resume — should unlock
8. When a trade executes, should receive a fill alert
9. When a position closes, should receive a close alert with P&L
10. Send /export — should return formatted trade history

IMPORTANT

- All commands must validate inputs. If a user sends /risk daily abc, reply "Invalid percentage. Use a number like 2 or 1.5"
- Commands that modify settings must call storage.saveSettings() to persist
- The bot token and allowed users come from .env via config.js
- Never expose credentials or internal state in command responses
- Keep command responses concise — one to three lines max for most commands
- The /export command is the only one that may send long messages
- Use the existing state object — commands read and modify it directly
- Do not create duplicate state or settings storageClean work. The bot now has all four phases: cTrader connection, signal pipeline, SL/TP amendment, and Telegram interface.

---

## What You Have

A single Node.js process that:
- Connects to cTrader, fetches symbols and account info
- Polls signals.route07.com for new alerts every 10 seconds
- Runs 5 risk checks with reversal detection
- Executes market orders with 30s fill timeout
- Sets SL immediately, TP after min hold timer
- Tracks daily P&L and locks trading at limit breach
- Provides Telegram commands for full control
- Persists settings and trade history to disk

---

## What's Left (From Your Spec)

| Feature | Status |
|:---|:---|
| Reversal execution (close old + open new) | Detected but not executed yet |
| /pnl command | Not built |
| /pnl reset | Not built |
| /history and /stats | /export exists, no aggregated stats |
| Setup wizard | Not built |
| Docker support | Not built |
| Volume filter on signals site | For later |
