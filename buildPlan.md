# Trading Bot Build Plan

## Phase 1: Setup & Initialization
- [x] Review specification (codebasePrompt.md)
- [ ] Verify package.json and install dependencies (@reiryoku/ctrader-layer, express, openclaw, dotenv, etc.)
- [ ] Create directory structure (src/, src/proxy/, src/bot/, src/state/, src/utils/, data/)
- [ ] Create .env.example file with all required variables

## Phase 2: Utilities & State Management
- [ ] Create logger.js (console + file logging with timestamps)
- [ ] Create pnl.js (daily PnL calculator)
- [ ] Initialize state files: settings.json, positions.json, tradeLog.json

## Phase 3: cTrader Proxy Module
- [ ] **connection.js** — CTrader WebSocket connection manager
  - ProtoOAApplicationAuthReq on open
  - ProtoOAAccountAuthReq after app auth
  - Exponential backoff reconnection (1s, 2s, 4s, 8s, max 60s)
  - Auto-refresh access token when expired
  - Event emitters for state changes
  
- [ ] **auth.js** — Token management
  - Access token refresh logic using refresh token
  - Token expiration tracking
  
- [ ] **heartbeat.js** — Keep-alive pings
  - Send ProtoHeartbeatEvent every 25 seconds
  - Detect stale connections (10s timeout)
  - Trigger reconnect if no response
  
- [ ] **server.js** — Express server setup (port 9009)
  - Mount all route handlers
  - Global error handling middleware
  
- [ ] **routes/** — REST endpoints
  - health.js — GET /health
  - balance.js — GET /balance
  - positions.js — GET /positions
  - trade.js — POST /trade
  - close.js — POST /close/:positionId
  - closeall.js — POST /closeall

## Phase 4: Telegram Bot Module
- [ ] **parser.js** — Signal parser
  - Parse "BUY BTCUSD SL=65000 TP=67000" format
  - Normalize direction (BUY/SELL/LONG/SHORT)
  - Validate SL present, TP optional
  - Return { direction, symbol, sl, tp, volume }
  
- [ ] **riskGate.js** — Pre-execution risk checks (8 checks)
  - Trading paused check
  - Symbol whitelist check
  - Weekend check
  - News blackout check
  - Max positions check
  - Max exposure check
  - Daily loss limit check
  - Duplicate signal check
  
- [ ] **bot.js** — OpenClaw bot setup
  - Initialize bot with token
  - Restrict to ALLOWED_USERS
  - Register command and signal handlers
  
- [ ] **commands/** — Command handlers
  - status.js — /status (proxy call + format)
  - balance.js — /balance (proxy call + format)
  - positions.js — /positions (proxy call + format)
  - pause.js — /pause (toggle paused flag)
  - resume.js — /resume (toggle paused flag)
  - closeall.js — /closeall (confirmation flow)
  - risk.js — /risk daily and /risk size
  - symbols.js — /symbols, /symbols add, /symbols remove
  - help.js — /help

## Phase 5: Main Entry Point
- [ ] **index.js** — Startup sequence
  - Load .env
  - Initialize state files if missing
  - Start Express server
  - Connect to cTrader
  - Start Telegram bot (after cTrader auth)
  - Graceful shutdown handler

## Phase 6: Testing & Validation
- [ ] Test proxy endpoints manually
- [ ] Test signal parsing with various formats
- [ ] Test risk gate checks
- [ ] Test Telegram command flows
- [ ] Test graceful shutdown
- [ ] Verify no credentials logged
- [ ] Verify error handling (no crashes)

---

## Dependency List
- @reiryoku/ctrader-layer
- express
- openclaw (or similar Telegram framework)
- dotenv
- (verify exact versions in package.json)

## Key Implementation Notes
- All responses: `{ success: boolean, data?: any, error?: string }`
- Rate limit: max one trade per 2 seconds
- Confirmation timeout: 60 seconds
- Duplicate detection window: 60 seconds
- All errors logged and returned to user
- No crashes allowed — wrap everything in try/catch
