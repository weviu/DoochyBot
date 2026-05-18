
Add a TradingView webhook endpoint to the existing trading bot project at /home/san/ctraderLayer/. The project already has a working Express proxy on port 9009 and a Telegram bot. Do NOT modify any existing files unless explicitly instructed below.

## WHAT TO BUILD

### 1. New file: src/proxy/routes/webhook.js

A POST route at /webhook that receives TradingView alerts, parses them, runs the risk gate, and forwards passing signals to the Telegram bot for user confirmation.

**Webhook behavior:**
- Accept POST requests with Content-Type: text/plain
- The body is a raw string in the existing signal format: "BUY BTCUSD SL=65000 TP=67000"
- Reuse the existing signal parser (src/bot/parser.js) to parse the raw body
- Reuse the existing risk gate (src/bot/riskGate.js) to validate the signal
- If parsing fails, return { success: false, error: "Invalid signal format" } with HTTP 400
- If risk gate rejects, return { success: false, reason: "..." } with HTTP 403
- If signal passes risk gate, forward it to the Telegram confirmation flow (see below)
- Return { success: true, message: "Signal passed risk checks. Awaiting confirmation." } with HTTP 200
- Log all webhook activity using the existing logger (src/utils/logger.js)

**How to forward to Telegram confirmation:**
The webhook runs inside the Express process, which is separate from the Telegram bot process. To send a confirmation message to the user, the webhook should:
1. Import and call a new helper function `sendConfirmation(signal)` from a new file: src/bot/confirm.js
2. This function sends a Telegram message to the user with trade details and inline [✅ Execute] [❌ Cancel] buttons
3. The confirmation message format: "TradingView Signal: BUY 0.01 BTCUSD @ Market | SL: 65000 | TP: 67000"
4. The Telegram bot instance must be accessible. Create a shared bot instance in a new file: src/bot/instance.js that both bot.js and confirm.js can import

### 2. New file: src/bot/instance.js

A tiny module that holds the shared Telegram bot instance:
- Export a function `setBot(telegrafInstance)` to store the bot
- Export a function `getBot()` to retrieve it
- Throw a clear error if getBot() is called before setBot()

### 3. New file: src/bot/confirm.js

Exports a function `sendConfirmation(signal)` that:
- Gets the bot instance via getBot()
- Reads settings.json to find the user's chat ID (add a field "chatId" to settings.json — see below)
- Sends a message: "TradingView Signal: {direction} {volume} {symbol} @ Market | SL: {sl} | TP: {tp}"
- Adds inline keyboard: [✅ Execute] [❌ Cancel]
- Sets up button handlers:
  - Execute: calls POST http://localhost:9009/trade with the signal, replies with result
  - Cancel: edits message to "Trade cancelled."
- Times out after 60 seconds, edits message to "Trade cancelled (timeout)."
- The button handlers should log the trade to tradeLog.json and update positions.json (reuse existing logic or keep it simple — the existing bot/commands/ already handles this, so just call the same internal functions if accessible, or duplicate minimally)

### 4. Modify: src/bot/bot.js

At the top, after creating the Telegraf bot instance:
- Import setBot from ./instance.js
- Call setBot(bot) immediately after bot creation

This makes the bot instance accessible to webhook.js via confirm.js.

### 5. Modify: src/proxy/server.js

In the registerRoutes function (or wherever routes are mounted):
- Add: this.app.post('/webhook', require('./routes/webhook')(this.connection))
- Make sure the webhook route is mounted BEFORE any body parser that expects JSON (webhook needs raw text)
- For the /webhook route specifically, use express.raw({ type: 'text/plain' }) or express.text() middleware so req.body is the raw string

### 6. Modify: src/state/settings.json

Add a new field:

"chatId": ""

The user sets this via a new /setchatid command (see below). The webhook needs this to know where to send confirmation messages.

### 7. New file: src/bot/commands/setchatid.js

A simple command handler:
- /setchatid — saves the current chat ID to settings.json's chatId field
- Reply: "Chat ID set. TradingView alerts will send confirmations here."

### 8. Register the new command

In bot.js, register /setchatid to use the handler from src/bot/commands/setchatid.js

### 9. Update /help command

Add /setchatid to the help text listing.

## IMPORTANT CONSTRAINTS

- Do NOT break existing Telegram command handlers
- Do NOT break the existing /trade endpoint on the proxy
- Do NOT remove confirmation flow — webhook signals must still get user approval
- The webhook must accept the exact same signal format as Telegram direct messages
- Use the existing logger (src/utils/logger.js) for all logging
- Use the existing parser (src/bot/parser.js) — do not write a new parser
- Use the existing risk gate (src/bot/riskGate.js) — do not write a new gate
- All new code should follow the same patterns and style as the existing project
- Handle errors gracefully — a malformed webhook should never crash the proxy

## TESTING THE WEBHOOK

Once built, the user will test with:

curl -X POST http://localhost:9009/webhook \
  -H "Content-Type: text/plain" \
  -d "BUY BTCUSD SL=65000 TP=67000"

This should:
1. Parse successfully
2. Pass or fail risk gate depending on settings
3. If passed, send a Telegram confirmation to the chat ID in settings.json
4. Return appropriate JSON response
