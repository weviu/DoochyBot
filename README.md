# 🤖 Automated Trading Bot with TradingView Integration

A production-ready Node.js trading bot that connects to cTrader's Open API, receives trading signals from TradingView, and executes trades with Telegram confirmations.

**Features:**
- ✅ REST API proxy to cTrader Open API (port 9009)
- ✅ TradingView webhook integration for automated signals
- ✅ Telegram bot with user confirmations and controls
- ✅ Risk management with 8-point validation system
- ✅ Graceful shutdown with proper cleanup
- ✅ Production-ready with PM2 and Docker support
- ✅ Real-time position tracking and P&L calculation

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [TradingView Integration](#tradingview-integration)
- [API Endpoints](#api-endpoints)
- [Telegram Commands](#telegram-commands)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- npm or yarn
- cTrader Open API credentials
- Telegram Bot Token
- Public domain with SSL (for webhooks)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd ctraderLayer

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Start bot (test mode - no cTrader needed)
node src/index-test.js

# Or production mode (with cTrader)
npm start
```

### First Run Checklist

- [ ] Update `.env` with your credentials
- [ ] Send `/setchatid` in Telegram to register
- [ ] Test webhook: `node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"`
- [ ] View positions: `cat data/positions.json | jq .`
- [ ] Check logs: `tail -f data/bot.log`

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   TradingView Alert                 │
│              Sends: BUY BTCUSD SL=65000 TP=67000   │
└────────────────────────┬────────────────────────────┘
                         │ POST /webhook
                         ↓
┌─────────────────────────────────────────────────────┐
│         nginx Reverse Proxy (aprhunter.route07.com)  │
│                    Port 443 (HTTPS)                 │
└────────────────────────┬────────────────────────────┘
                         │ http://localhost:9009
                         ↓
┌─────────────────────────────────────────────────────┐
│          Express Proxy Server (Port 9009)           │
│  • Webhook receiver                                 │
│  • Risk gate validation                             │
│  • Telegram confirmation sender                     │
│  • REST API endpoints                               │
└────────────────┬────────────────────┬───────────────┘
                 │                    │
        ┌────────▼──────┐   ┌─────────▼────────┐
        │  cTrader API   │   │  Telegram Bot    │
        │  Port 5035     │   │  (grammY)        │
        │  WebSocket     │   │                  │
        └────────────────┘   └──────────────────┘
        
State Files:
├── settings.json (config, chatId, symbols)
├── positions.json (open trades)
└── tradeLog.json (execution history)
```

---

## 📦 Installation

### 1. Clone & Setup

```bash
git clone <repo-url>
cd ctraderLayer
npm install
```

### 2. Environment Variables

Create `.env` file:

```env
# cTrader Configuration
CTRADER_HOST=demo.ctraderapi.com
CTRADER_PORT=5035
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
ACCESS_TOKEN=your_access_token
REFRESH_TOKEN=your_refresh_token
ACCOUNT_ID=your_account_id

# Proxy Server
PROXY_PORT=9009

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_USERS=user_id_1,user_id_2

# Environment
NODE_ENV=production
```

### 3. Initial Data Files

Bot creates automatically:
```
data/
├── settings.json       # Trading configuration
├── positions.json      # Open positions
├── tradeLog.json       # Trade history
└── bot.log            # Application logs
```

---

## ⚙️ Configuration

### settings.json

```json
{
  "paused": false,
  "chatId": 123456789,
  "allowedSymbols": ["BTCUSD", "XAUUSD", "XAGUSD"],
  "symbolLotSizes": {
    "BTCUSD": 0.01,
    "XAUUSD": 1.0,
    "XAGUSD": 50.0
  },
  "maxPositions": 5,
  "maxTotalExposure": 50000,
  "dailyLossLimit": 5,
  "blackoutTimes": []
}
```

### Update Settings via Telegram

```
/symbols                           # List allowed symbols
/symbols add ETHUSDT 0.1          # Add new symbol
/symbols remove XAGUSD            # Remove symbol
/risk daily 5                     # Set 5% daily loss limit
/risk size BTCUSD 0.05           # Set lot size for BTCUSD
/pause                            # Pause trading (block new signals)
/resume                           # Resume trading
```

---

## 🎯 Usage

### Test Mode (No cTrader Required)

Perfect for testing TradingView integration:

```bash
node src/index-test.js
```

Output:
```
✅ Proxy running on port 9009
✅ Telegram bot active
📝 TEST MODE: Mock connection (trades simulated)
```

### Production Mode (Real cTrader)

```bash
npm start
```

Logs will show:
```
✅ Connecting to cTrader...
✅ Authenticated to cTrader
✅ Starting heartbeat (25s interval)
✅ Telegram bot connected
```

### Test Webhook Signal

```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

Expected response:
```
✅ Signal received
📊 Checking risk gates...
📱 Sending Telegram confirmation...
⏱️ Waiting 60 seconds for user approval
```

---

## 🔔 TradingView Integration

### Setup Steps

**Step 1: Register Your Telegram Chat**

In Telegram, send to your bot:
```
/setchatid
```

Response: "✅ Chat ID saved!"

**Step 2: Create TradingView Alert**

1. Go to your TradingView chart
2. Create/edit your strategy
3. Add alert with:
   - **Webhook URL:** `https://aprhunter.route07.com/webhook`
   - **Message:** `BUY BTCUSD SL=65000 TP=67000`
4. Set alert to fire on your conditions

**Step 3: Confirm Execution**

When alert fires:
1. Telegram sends confirmation message with Execute/Cancel buttons
2. Click **Execute** to place trade
3. 60-second timeout (after that, confirmation expires)

### Signal Format

```
{DIRECTION} {SYMBOL} SL={PRICE} [TP={PRICE}]
```

**Valid Directions:** `BUY`, `SELL`, `LONG`, `SHORT`

**Examples:**
```
BUY BTCUSD SL=65000 TP=67000
SELL XAUUSD SL=2050
LONG EURUSD SL=1.0800
SHORT GBPUSD SL=1.2700 TP=1.2500
```

### Pine Script Example

```pine
//@version=5
strategy("My Trading Strategy", overlay=true)

// Your strategy logic here
if longCondition
    alertMessage = "BUY BTCUSD SL=65000 TP=67000"
    strategy.entry("Long", strategy.long)
    alert(alertMessage)

if shortCondition
    alertMessage = "SELL BTCUSD SL=66000 TP=64000"
    strategy.entry("Short", strategy.short)
    alert(alertMessage)
```

---

## 🔌 API Endpoints

All endpoints on `https://aprhunter.route07.com` (or `http://localhost:9009` locally)

### Health Check
```bash
GET /health
```

Response:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "authenticated": true,
    "accountId": "17114200"
  }
}
```

### Get Account Balance
```bash
GET /balance
```

Response:
```json
{
  "success": true,
  "data": {
    "equity": 50000,
    "margin": 25000,
    "freeMargin": 25000,
    "usedMargin": 0
  }
}
```

### Get Open Positions
```bash
GET /positions
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "positionId": 123456,
      "symbol": "BTCUSD",
      "direction": "BUY",
      "volume": 0.1,
      "entryPrice": 65000,
      "currentPrice": 65500,
      "pnl": 50,
      "stopLoss": 64500,
      "takeProfit": 66000
    }
  ]
}
```

### Execute Trade
```bash
POST /trade
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "direction": "BUY",
  "volume": 0.1,
  "sl": 65000,
  "tp": 67000
}
```

### Close Position
```bash
POST /close/{positionId}
```

### Close All Positions
```bash
POST /closeall
```

### TradingView Webhook
```bash
POST /webhook
Content-Type: text/plain

BUY BTCUSD SL=65000 TP=67000
```

---

## 💬 Telegram Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `/start` | Welcome message | `/start` |
| `/help` | Show all commands | `/help` |
| `/setchatid` | Register your chat (**do this first!**) | `/setchatid` |
| `/status` | Account status & daily P&L | `/status` |
| `/balance` | Show equity/margin | `/balance` |
| `/positions` | List open trades | `/positions` |
| `/pause` | Disable new signals | `/pause` |
| `/resume` | Enable signals | `/resume` |
| `/symbols` | List allowed symbols | `/symbols` |
| `/symbols add COIN SIZE` | Add symbol | `/symbols add ETHUSDT 0.1` |
| `/symbols remove COIN` | Remove symbol | `/symbols remove XAGUSD` |
| `/risk daily PCT` | Set daily loss limit | `/risk daily 5` |
| `/risk size COIN VOL` | Set lot size | `/risk size BTCUSD 0.05` |
| `/closeall` | Close all positions | `/closeall` |
| `/tv` | TradingView setup guide | `/tv` |

---

## 🚀 Deployment

### Option 1: PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start bot with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs DoochyBot

# Monitor
pm2 monit

# Stop
pm2 stop DoochyBot

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Option 2: Docker

```bash
# Build image
docker build -t trading-bot .

# Run container
docker run -d \
  --name trading-bot \
  -p 9009:9009 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  trading-bot

# View logs
docker logs -f trading-bot

# Stop
docker stop trading-bot
```

### Option 3: Docker Compose

```bash
# Start
docker-compose up -d

# Logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## 🔐 Security Considerations

### Before Production:

- [ ] Use strong Telegram bot token
- [ ] Restrict `/setchatid` to authenticated users only
- [ ] Use HTTPS only (nginx with SSL ✓)
- [ ] Keep `.env` secret (never commit to git)
- [ ] Use IP whitelisting if possible
- [ ] Monitor webhook access logs
- [ ] Set rate limits on `/webhook` endpoint

### Production Checklist:

```bash
# Set proper file permissions
chmod 600 .env
chmod 700 data/

# Use environment variables, not .env in production
export CTRADER_HOST=...
export CLIENT_ID=...
# ... etc

# Run with PM2
pm2 start ecosystem.config.js --env production
```

---

## 🐛 Troubleshooting

### Webhook Returns 502 Bad Gateway

**Problem:** `https://aprhunter.route07.com/webhook` returns 502

**Solutions:**
1. Check bot is running: `curl http://localhost:9009/health`
2. Verify nginx config: `sudo nginx -t`
3. Check logs: `sudo tail -50 /var/log/nginx/error.log`
4. Restart nginx: `sudo systemctl restart nginx`

### No Telegram Confirmation Appearing

**Problem:** Webhook receives signal but no Telegram message

**Solutions:**
1. Check `/setchatid` was sent: `cat data/settings.json | grep chatId`
2. If empty, send `/setchatid` in Telegram
3. Verify bot token is correct in `.env`
4. Check logs: `tail -f data/bot.log | grep -i telegram`

### "Unsupported symbol" Error

**Problem:** Signal rejected because symbol not in whitelist

**Solutions:**
```bash
# Add symbol via Telegram
/symbols add ETHUSDT 0.1

# Or edit settings.json directly
cat data/settings.json | jq .allowedSymbols
```

### Connection Refused on Port 9009

**Problem:** `curl http://localhost:9009/health` fails

**Solutions:**
```bash
# Check if bot is running
ps aux | grep "node src"

# Check if port is in use
lsof -i :9009

# Start bot
npm start
# or
node src/index-test.js
```

### cTrader Authentication Fails

**Problem:** Logs show "Application auth failed"

**Solutions:**
1. Verify credentials in `.env`
2. Check account ID is correct
3. Confirm API access is approved
4. Test with test mode: `node src/index-test.js`

### 60-Second Timeout Too Short

**Problem:** Not enough time to click confirmation button

**Solution:** Modify in `src/bot/confirm.js` line 45:
```javascript
const timeout = 60000; // Change to 120000 for 2 minutes
```

---

## 📊 File Structure

```
ctraderLayer/
├── src/
│   ├── index.js              # Main entry point
│   ├── index-test.js         # Test mode (no cTrader)
│   ├── proxy/
│   │   ├── server.js         # Express HTTP server
│   │   ├── connection.js     # cTrader connection manager
│   │   ├── heartbeat.js      # Keep-alive heartbeats
│   │   └── routes/
│   │       ├── health.js
│   │       ├── balance.js
│   │       ├── positions.js
│   │       ├── trade.js
│   │       ├── close.js
│   │       └── webhook.js    # TradingView receiver
│   ├── bot/
│   │   ├── bot.js            # Telegram bot (grammY)
│   │   ├── instance.js       # Bot instance holder
│   │   ├── parser.js         # Signal parser
│   │   ├── riskGate.js       # Risk validation
│   │   ├── confirm.js        # TradingView confirmation
│   │   └── commands/         # Telegram command handlers
│   └── utils/
│       └── logger.js         # File + console logging
├── data/
│   ├── settings.json         # Configuration (runtime)
│   ├── positions.json        # Open trades
│   ├── tradeLog.json         # Trade history
│   └── bot.log              # Application logs
├── docs/
│   ├── TRADINGVIEW-SETUP.md  # TradingView integration guide
│   ├── TRADINGVIEW-QUICK.md  # Quick reference
│   ├── TEST-WEBHOOK.md       # Testing guide
│   └── DEPLOYMENT.md         # Deployment options
├── .env                      # Environment variables (secret!)
├── .env.example             # Template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies
├── package-lock.json        # Lock file
├── ecosystem.config.js      # PM2 configuration
├── Dockerfile               # Container image
├── docker-compose.yml       # Docker orchestration
├── test-webhook.js          # CLI webhook tester
└── README.md               # This file
```

---

## 📚 Documentation

- **[TRADINGVIEW-SETUP.md](docs/TRADINGVIEW-SETUP.md)** - Complete TradingView integration guide
- **[TRADINGVIEW-QUICK.md](docs/TRADINGVIEW-QUICK.md)** - Quick reference card
- **[TEST-WEBHOOK.md](docs/TEST-WEBHOOK.md)** - Testing procedures
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Production deployment options

---

## 🔄 Risk Management

The bot validates signals through **8 sequential checks** before execution:

1. **Paused Check** - Is trading paused?
2. **Symbol Whitelist** - Is symbol allowed?
3. **Weekend Check** - No trading on weekends
4. **Blackout Times** - Outside restricted hours?
5. **Max Positions** - Under position limit?
6. **Max Exposure** - Under exposure limit?
7. **Daily Loss** - Not exceeded daily loss limit?
8. **Duplicate** - Not duplicate signal within 60s?

If any check fails, the signal is rejected and user is notified.

---

## 🛠️ Development

### Local Development

```bash
# Install dev dependencies
npm install --save-dev nodemon

# Run with auto-reload
npx nodemon src/index-test.js

# Test mode allows full development without cTrader
```

### Adding New Commands

Create file `src/bot/commands/mycommand.js`:

```javascript
const logger = require('../../utils/logger');

module.exports = () => {
  return async (ctx) => {
    try {
      await ctx.reply('Hello from mycommand!');
      logger.info('My command executed');
    } catch (err) {
      logger.error('My command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
```

Register in `src/bot/bot.js`:

```javascript
const myCmd = require('./commands/mycommand');
this.bot.command('mycommand', myCmd());
```

---

## 📞 Support

**Issues?**
1. Check logs: `tail -f data/bot.log`
2. Read [Troubleshooting](#troubleshooting)
3. Check documentation files in `docs/`
4. Verify `.env` configuration

**Common Issues:**
- See [Troubleshooting](#troubleshooting) section above

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🎉 Quick Demo

```bash
# 1. Start bot in test mode
node src/index-test.js

# 2. In another terminal, send a test signal
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"

# 3. In Telegram, you'll see confirmation (if /setchatid was sent)
# 4. Click Execute or Cancel

# 5. Check the position was saved
cat data/positions.json | jq .
```

---

**Made with ❤️ for automated trading**

Questions? Check the `/tv` command in Telegram for setup help!
