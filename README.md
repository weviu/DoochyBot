# ctraderLayer

A Node.js trading bot that connects TradingView signals → Telegram confirmation → cTrader execution via the cTrader Open API (WebSocket).

---

## Architecture

```
TradingView Alert
      │
      ▼ POST /webhook
Express Proxy (port 9009)
      │                    │
      ▼                    ▼
cTrader Open API      Telegram Bot
(WebSocket/TLS)       (grammY, polling)
live.ctraderapi.com:5035
```

**Key files:**

| File | Role |
|------|------|
| `src/index.js` | Entry point — loads config, starts connection, then proxy+bot |
| `src/proxy/connection.js` | WebSocket manager, event forwarding, reconnect logic |
| `src/proxy/server.js` | Express HTTP server |
| `src/proxy/routes/trade.js` | POST /trade — market order + SL/TP amendment |
| `src/proxy/amendPosition.js` | Sends ProtoOAAmendPositionSLTPReq after fill |
| `src/proxy/heartbeat.js` | 25s keep-alive pings |
| `src/bot/bot.js` | Telegram bot (grammY) |
| `src/state/tradeLog.json` | Trade history (JSON array) |
| `data/bot.log` | Application log |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure `.env`

```env
CTRADER_HOST=live.ctraderapi.com
CTRADER_PORT=5035

CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
ACCESS_TOKEN=your_access_token
REFRESH_TOKEN=your_refresh_token
ACCOUNT_ID=47483124          # internal account ID — see note below

PROXY_PORT=9009

TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_USERS=123456789,987654321

NODE_ENV=production
```

> **ACCOUNT_ID is the internal cTrader ID, not the display ID.**
> The display ID shown in the cTrader UI (e.g. 17124220) is different.
> Run `node lookup-account-id.js` to find the correct internal ID for any access token.

### 3. Start

```bash
npm start
```

---

## Utility Scripts

### Find internal account ID

```bash
node lookup-account-id.js
```

Connects, authenticates, and prints all accounts linked to the current `ACCESS_TOKEN` with their internal `ctidTraderAccountId`.

### Find symbol IDs for an account

```bash
node lookup-symbols.js
```

Prints all symbols available on the account. Symbol IDs vary per broker — always verify after switching accounts.

---

## API Endpoints

All on `http://localhost:9009`.

### Health check

```bash
GET /health
```

### Account balance

```bash
GET /balance
```

### Open positions

```bash
GET /positions
```

### Execute trade

```bash
POST /trade
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "direction": "BUY",
  "volume": 0.01,
  "sl": 67000,
  "tp": 72000
}
```

Response (success):
```json
{
  "success": true,
  "data": {
    "positionId": "7241688",
    "openPrice": 69401,
    "slSet": true,
    "tpSet": true
  }
}
```

Response (trade filled, but SL/TP rejected):
```json
{
  "success": true,
  "data": {
    "positionId": "7241688",
    "openPrice": 69401,
    "slSet": false,
    "tpSet": false,
    "slError": "New TP for BUY position should be >= current BID price..."
  }
}
```

**SL/TP rules for MARKET orders:**
- cTrader does not allow SL/TP on MARKET order requests
- They are set via `ProtoOAAmendPositionSLTPReq` after `ORDER_FILLED`
- For BUY: SL must be below entry price, TP must be above entry price
- For SELL: SL must be above entry price, TP must be below entry price

### Close position

```bash
POST /close/:positionId
```

### Close all positions

```bash
POST /closeall
```

### TradingView webhook

```bash
POST /webhook
Content-Type: application/json

{ "symbol": "BTCUSD", "direction": "BUY", "volume": 0.01, "sl": 67000, "tp": 72000 }
```

---

## Symbol Reference

Verified on FTMO live account 47483124. Run `node lookup-symbols.js` when switching accounts.

| Symbol | cTrader ID | Lot Size | Min vol | Max vol |
|--------|-----------|----------|---------|---------|
| EURUSD | 1 | 10,000,000 | 0.01 lot | very large |
| GBPUSD | 2 | 10,000,000 | 0.01 lot | very large |
| USDJPY | 4 | 10,000,000 | 0.01 lot | very large |
| AUDUSD | 5 | 10,000,000 | 0.01 lot | very large |
| USDCHF | 6 | 10,000,000 | 0.01 lot | very large |
| USDCAD | 8 | 10,000,000 | 0.01 lot | very large |
| NZDUSD | 12 | 10,000,000 | 0.01 lot | very large |
| XAUUSD / GOLD | 41 | 10,000 | 0.01 lot | very large |
| USOIL / OIL | 273 | 10,000 | 0.01 lot | 100 lots |
| ETHUSD | 323 | 1,000 | 0.01 lot | 5 lots |
| BTCUSD | 324 | 100 | 0.01 lot | 5 lots |

**Volume conversion:** `protocol_volume = user_lots × lot_size`

Example — BTCUSD 0.01 lots:
```
0.01 × 100 = 1 protocol unit  →  cTrader displays as 0.01
```

---

## cTrader API Quirks

These caused bugs and are documented here to prevent regressions.

### 1. Event wrapper
Events from the library arrive wrapped in a `CTraderLayerEvent` with non-enumerable properties. Always extract via `.descriptor`:
```javascript
const descriptor = event.descriptor || {};
```

### 2. Account ID as string
`ctidTraderAccountId` in events arrives as a **string**, even though it looks like a number.
Always compare with `String()`:
```javascript
String(event.ctidTraderAccountId) === String(connection.accountId)
```

### 3. No SL/TP on MARKET orders
```
Error: "SL/TP in absolute values are allowed only for order types: [LIMIT, STOP, STOP_LIMIT]"
```
Use `ProtoOAAmendPositionSLTPReq` after `ORDER_FILLED`. See `src/proxy/amendPosition.js`.

### 4. Amendment has no response type
`ProtoOAAmendPositionSLTPReq` has no matching `...Res`. The library auto-resolves it with `{}`.
Errors come back as `ProtoOAOrderErrorEvent` carrying the original `clientMsgId`.
The amendment module passes a custom `clientMsgId` and listens for an error event matching it for 3 seconds — silence = success.

### 5. ORDER_ACCEPTED vs ORDER_FILLED
- `ORDER_ACCEPTED`: position exists but `price = 0`
- `ORDER_FILLED`: has actual `executionPrice`

Always wait for `ORDER_FILLED` before capturing entry price or running amendment.

### 6. Register listeners before sending
Events can arrive before the `sendCommand` async returns. Register listeners first:
```javascript
connection.on('ProtoOAExecutionEvent', handler);  // first
await connection.connection.sendCommand('ProtoOANewOrderReq', payload);  // then
```

### 7. Heartbeat timeouts are non-critical
Logs show `[WARN] Heartbeat timeout` periodically. cTrader does not respond to heartbeat pings. Trades execute normally despite these warnings.

---

## Deployment

### PM2

```bash
pm2 start ecosystem.config.js
pm2 logs
pm2 monit
```

### Docker Compose

```bash
docker-compose up -d
docker-compose logs -f
```

The `.env.docker` file is used by Docker Compose.

---

## Logs

```bash
tail -f data/bot.log
```

Trade history:
```bash
cat src/state/tradeLog.json
```
