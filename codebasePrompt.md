Build a personal trading bot as a single Node.js application with two modules:

1. A cTrader API proxy that maintains a persistent WebSocket connection to cTrader's demo environment and exposes REST endpoints on localhost:9009
2. A Telegram bot (using OpenClaw framework) that receives trading signals as direct messages, validates them, and calls the proxy to execute trades

## TECH STACK
- Runtime: Node.js
- cTrader library: @reiryoku/ctrader-layer
- Web framework for proxy: Express
- Telegram: OpenClaw bot framework
- Storage: JSON flat files (no database)
- Config: .env file

## PROJECT STRUCTURE

/
├── .env                    # Credentials and config
├── package.json
├── src/
│   ├── index.js            # Entry point - starts both modules
│   ├── proxy/
│   │   ├── server.js       # Express server on port 9009
│   │   ├── connection.js   # cTrader WebSocket connection manager
│   │   ├── auth.js         # Token management and refresh
│   │   ├── routes/
│   │   │   ├── health.js   # GET /health
│   │   │   ├── positions.js # GET /positions
│   │   │   ├── balance.js  # GET /balance
│   │   │   ├── trade.js    # POST /trade
│   │   │   ├── close.js    # POST /close/:positionId
│   │   │   └── closeall.js # POST /closeall
│   │   └── heartbeat.js    # Keep-alive ping every 25 seconds
│   ├── bot/
│   │   ├── bot.js          # OpenClaw Telegram bot setup
│   │   ├── commands/       # Command handlers
│   │   │   ├── status.js
│   │   │   ├── balance.js
│   │   │   ├── positions.js
│   │   │   ├── pause.js
│   │   │   ├── resume.js
│   │   │   ├── closeall.js
│   │   │   ├── risk.js
│   │   │   ├── symbols.js
│   │   │   └── help.js
│   │   ├── parser.js       # Signal message parser
│   │   └── riskGate.js     # Pre-execution risk checks
│   ├── state/
│   │   ├── settings.json   # User settings (lot sizes, allowed symbols, etc.)
│   │   ├── positions.json  # Locally tracked positions
│   │   └── tradeLog.json   # Executed trades history
│   └── utils/
│       ├── logger.js       # Simple console + file logger
│       └── pnl.js          # Daily PnL calculator
└── data/                   # Log files


## .env FILE

CTRADER_HOST=demo.ctraderapi.com
CTRADER_PORT=5035
CLIENT_ID=
CLIENT_SECRET=
ACCESS_TOKEN=
REFRESH_TOKEN=
ACCOUNT_ID=
PROXY_PORT=9009
TELEGRAM_BOT_TOKEN=
ALLOWED_USERS=           # Comma-separated Telegram user IDs


## CTRADER PROXY (port 9009)

### Connection Manager (connection.js)
- On startup: create CTraderConnection with host and port from .env
- On connection open: authenticate app (ProtoOAApplicationAuthReq) then account (ProtoOAAccountAuthReq)
- Handle connection drops: exponential backoff reconnection (1s, 2s, 4s, 8s, max 60s)
- Auto-refresh access token when expired using refresh token
- Emit events for connection state changes so the Express layer can report /health accurately
- Log all connection events with timestamps

### Heartbeat (heartbeat.js)
- Send ProtoHeartbeatEvent every 25 seconds
- If no response within 10 seconds, mark connection as stale and trigger reconnect

### REST Endpoints
All endpoints return JSON with structure: { success: boolean, data?: any, error?: string }

GET /health
- Returns: connection status (connected/disconnected/reconnecting), account ID, account balance summary

GET /positions
- Fetches open positions from cTrader via ProtoOAPositionListReq
- Returns array of positions with: positionId, symbol, direction (buy/sell), volume, openPrice, currentPrice, sl, tp, pnl, openTime

GET /balance
- Fetches account info
- Returns: equity, balance, margin, freeMargin, marginLevel

POST /trade
- Body: { symbol: string, direction: "BUY"|"SELL", volume: number, sl?: number, tp?: number }
- Validates required fields
- Creates market order with specified SL/TP via ProtoOAOrderReq
- Returns order result with orderId and positionId

POST /close/:positionId
- Closes specific position by positionId
- Returns close confirmation

POST /closeall
- Fetches all open positions and closes them one by one
- Returns count of closed positions and any failures

### Error Handling
- Wrap all cTrader command calls in try/catch
- Return meaningful error messages (not raw protobuf errors)
- Never crash the Express server on a failed cTrader call
- Log all errors with timestamps

## TELEGRAM BOT (OpenClaw)

### Bot Setup (bot.js)
- Initialize OpenClaw bot with token from .env
- Restrict to ALLOWED_USERS list (if empty, allow all — warn on startup)
- Register all command handlers
- Register signal message handler (catches messages matching signal pattern)

### Signal Parser (parser.js)
Parse direct messages in this format:

BUY BTCUSD SL=65000 TP=67000
SELL XAUUSD SL=2320.50 TP=2305.00
BUY XAGUSD SL=27.50

Rules:
- Direction: BUY, SELL, LONG, or SHORT (case-insensitive, normalize to BUY/SELL)
- Symbol: any string after direction and before SL= or end of line
- SL: required, format SL=price (if missing, reject signal with error message)
- TP: optional, format TP=price (if missing, order has no take profit)
- Volume: NOT in the signal. Always use the fixed lot size from settings.json for that symbol
- If symbol not in allowed symbols list, reject with message
- Return structured object: { direction, symbol, sl, tp, volume }

### Risk Gate (riskGate.js)
Run these checks before calling the proxy. Return { passed: boolean, reason?: string }

Checks in order:
1. Is trading enabled? (check settings.json paused flag) — reject "Trading is paused"
2. Is symbol in allowed list? (check settings.json allowedSymbols) — reject "Symbol not in allowed list"
3. Is it a weekday and not weekend? — reject "Trading is closed on weekends"
4. Is there an active news blackout? (check settings.json blackoutTimes) — reject "News blackout active"
5. Would this trade exceed max open positions? (check positions.json length vs settings.json maxPositions) — reject "Max positions reached"
6. Would this trade exceed max total exposure? (sum of all position volumes + new trade vs settings.json maxTotalExposure) — reject "Max exposure exceeded"
7. Has daily loss limit been reached? (check daily PnL vs settings.json dailyLossLimit) — reject "Daily loss limit reached"
8. Is this a duplicate signal? (same symbol and direction in last 60 seconds) — reject "Duplicate signal"

### Confirmation Flow
When a signal passes risk gate:
1. Send user a confirmation message with trade details:
   "Execute? BUY 0.01 BTCUSD @ Market | SL: 65000 | TP: 67000"
2. Add inline keyboard buttons: [✅ Execute] [❌ Cancel]
3. Wait for user to press Execute (timeout after 60 seconds, auto-cancel with message)
4. On Execute: call POST /trade on the proxy
5. On success: reply with "Executed: BUY 0.01 BTCUSD @ 65200 | Order #123"
6. On failure: reply with error message
7. Log trade to tradeLog.json
8. Update positions.json with new position

### Commands

/status
- Call GET /health on proxy
- Call GET /positions on proxy
- Format and send: connection status, number of open positions, daily PnL, trading enabled/disabled

/balance
- Call GET /balance on proxy
- Send: Equity, Balance, Margin Used, Free Margin, Margin Level %

/positions
- Call GET /positions on proxy
- Send each position on its own line: "BUY 0.01 BTCUSD @ 65200 | PnL: +$150.00 | SL: 65000 | TP: 67000"
- If no positions: "No open positions"

/pause
- Set settings.json paused = true
- Reply: "Trading paused. Use /resume to re-enable."

/resume
- Set settings.json paused = false
- Reply: "Trading resumed."

/closeall
- Require confirmation: "Close ALL positions? [✅ Yes] [❌ No]"
- On confirm: call POST /closeall on proxy
- Reply with results: "Closed 3 positions. Failed: 0"

/risk daily <percent>
- Update settings.json dailyLossLimit
- Reply: "Daily loss limit set to X%"

/risk size <symbol> <volume>
- Update settings.json symbolLotSizes[symbol] = volume
- Reply: "Lot size for SYMBOL set to X"

/symbols
- List allowed symbols from settings.json with their lot sizes

/symbols add <symbol> <volume>
- Add symbol to allowed list with default lot size
- Reply: "Added SYMBOL with lot size X"

/symbols remove <symbol>
- Remove from allowed list
- Reply: "Removed SYMBOL"

/help
- List all commands with brief descriptions

### State Files

settings.json default:

{
  "paused": false,
  "allowedSymbols": ["BTCUSD", "XAUUSD", "XAGUSD"],
  "symbolLotSizes": {
    "BTCUSD": 0.01,
    "XAUUSD": 0.05,
    "XAGUSD": 0.1
  },
  "maxPositions": 3,
  "maxTotalExposure": 1.0,
  "dailyLossLimit": 5,
  "blackoutTimes": []
}

positions.json default: []
tradeLog.json default: []

### Logging (logger.js)
- Log to console AND to data/bot.log
- Format: [YYYY-MM-DD HH:MM:SS] [LEVEL] message
- Levels: INFO (trades, commands), WARN (failed retries, risk rejects), ERROR (connection drops, crashes)
- Log all trade executions with full details
- Log all risk gate rejections with reason

## STARTUP SEQUENCE (index.js)
1. Load .env config
2. Initialize state files if they don't exist
3. Start Express proxy server
4. Connect to cTrader
5. Once cTrader connection is authenticated, start Telegram bot
6. Log "Bot ready" with account summary
7. Handle graceful shutdown: close cTrader connection, close Express, disconnect bot

## ERROR HANDLING PRINCIPLES
- The bot must never crash from an unexpected signal format
- The proxy must never crash from a cTrader API error
- Always reply to the user — even if it's an error, they should know what happened
- Rate limit self: max one trade per 2 seconds
- If proxy is unreachable, tell the user "Unable to reach trading server"

## SECURITY
- Never log API keys or tokens
- Mask credentials in all log output
- Validate ALLOWED_USERS strictly
- No withdrawal or account management endpoints in the proxy