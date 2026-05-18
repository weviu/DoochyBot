  Automated Trading Bot with TradingView Integration

A production-ready Node.js trading bot that connects to cTrader's Open API, receives trading signals from TradingView, and executes trades with Telegram confirmations.

Features:
-  REST API proxy to cTrader Open API (port )
-  TradingView webhook integration for automated signals
-  Telegram bot with user confirmations and controls
-  Risk management with -point validation system
-  Graceful shutdown with proper cleanup
-  Production-ready with PM and Docker support
-  Real-time position tracking and P&L calculation

---

  Table of Contents

- [Quick Start](quick-start)
- [System Architecture](system-architecture)
- [Installation](installation)
- [Configuration](configuration)
- [Usage](usage)
- [TradingView Integration](tradingview-integration)
- [API Endpoints](api-endpoints)
- [Telegram Commands](telegram-commands)
- [Deployment](deployment)
- [Troubleshooting](troubleshooting)

---

  Quick Start

 Prerequisites
- Node.js v+
- npm or yarn
- cTrader Open API credentials
- Telegram Bot Token
- Public domain with SSL (for webhooks)

 Installation

```bash
 Clone repository
git clone <repo-url>
cd ctraderLayer

 Install dependencies
npm install

 Copy environment template
cp .env.example .env

 Edit configuration
nano .env

 Start bot (test mode - no cTrader needed)
node src/index-test.js

 Or production mode (with cTrader)
npm start
```

 First Run Checklist

- [ ] Update `.env` with your credentials
- [ ] Send `/setchatid` in Telegram to register
- [ ] Test webhook: `node test-webhook.js "BUY BTCUSD SL= TP="`
- [ ] View positions: `cat data/positions.json | jq .`
- [ ] Check logs: `tail -f data/bot.log`

---

  System Architecture

```

                   TradingView Alert                 
              Sends: BUY BTCUSD SL= TP=   

                          POST /webhook
                         ↓

         nginx Reverse Proxy (aprhunter.route.com)  
                    Port  (HTTPS)                 

                          http://localhost:
                         ↓

          Express Proxy Server (Port )           
  • Webhook receiver                                 
  • Risk gate validation                             
  • Telegram confirmation sender                     
  • REST API endpoints                               

                                     
           
          cTrader API        Telegram Bot    
          Port           (grammY)        
          WebSocket                          
           
        
State Files:
 settings.json (config, chatId, symbols)
 positions.json (open trades)
 tradeLog.json (execution history)
```

---

  Installation

 . Clone & Setup

```bash
git clone <repo-url>
cd ctraderLayer
npm install
```

 . Environment Variables

Create `.env` file:

```env
 cTrader Configuration
CTRADER_HOST=demo.ctraderapi.com
CTRADER_PORT=
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
ACCESS_TOKEN=your_access_token
REFRESH_TOKEN=your_refresh_token
ACCOUNT_ID=your_account_id

 Proxy Server
PROXY_PORT=

 Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_USERS=user_id_,user_id_

 Environment
NODE_ENV=production
```

 . Initial Data Files

Bot creates automatically:
```
data/
 settings.json        Trading configuration
 positions.json       Open positions
 tradeLog.json        Trade history
 bot.log             Application logs
```

---

  Configuration

 settings.json

```json
{
  "paused": false,
  "chatId": ,
  "allowedSymbols": ["BTCUSD", "XAUUSD", "XAGUSD"],
  "symbolLotSizes": {
    "BTCUSD": .,
    "XAUUSD": .,
    "XAGUSD": .
  },
  "maxPositions": ,
  "maxTotalExposure": ,
  "dailyLossLimit": ,
  "blackoutTimes": []
}
```

 Update Settings via Telegram

```
/symbols                            List allowed symbols
/symbols add ETHUSDT .           Add new symbol
/symbols remove XAGUSD             Remove symbol
/risk daily                       Set % daily loss limit
/risk size BTCUSD .            Set lot size for BTCUSD
/pause                             Pause trading (block new signals)
/resume                            Resume trading
```

---

  Usage

 Test Mode (No cTrader Required)

Perfect for testing TradingView integration:

```bash
node src/index-test.js
```

Output:
```
 Proxy running on port 
 Telegram bot active
 TEST MODE: Mock connection (trades simulated)
```

 Production Mode (Real cTrader)

```bash
npm start
```

Logs will show:
```
 Connecting to cTrader...
 Authenticated to cTrader
 Starting heartbeat (s interval)
 Telegram bot connected
```

 Test Webhook Signal

```bash
node test-webhook.js "BUY BTCUSD SL= TP="
```

Expected response:
```
 Signal received
 Checking risk gates...
 Sending Telegram confirmation...
⏱ Waiting  seconds for user approval
```

---

  TradingView Integration

 Setup Steps

Step : Register Your Telegram Chat

In Telegram, send to your bot:
```
/setchatid
```

Response: " Chat ID saved!"

Step : Create TradingView Alert

. Go to your TradingView chart
. Create/edit your strategy
. Add alert with:
   - Webhook URL: `https://aprhunter.route.com/webhook`
   - Message: `BUY BTCUSD SL= TP=`
. Set alert to fire on your conditions

Step : Confirm Execution

When alert fires:
. Telegram sends confirmation message with Execute/Cancel buttons
. Click Execute to place trade
. -second timeout (after that, confirmation expires)

 Signal Format

```
{DIRECTION} {SYMBOL} SL={PRICE} [TP={PRICE}]
```

Valid Directions: `BUY`, `SELL`, `LONG`, `SHORT`

Examples:
```
BUY BTCUSD SL= TP=
SELL XAUUSD SL=
LONG EURUSD SL=.
SHORT GBPUSD SL=. TP=.
```

 Pine Script Example

```pine
//@version=
strategy("My Trading Strategy", overlay=true)

// Your strategy logic here
if longCondition
    alertMessage = "BUY BTCUSD SL= TP="
    strategy.entry("Long", strategy.long)
    alert(alertMessage)

if shortCondition
    alertMessage = "SELL BTCUSD SL= TP="
    strategy.entry("Short", strategy.short)
    alert(alertMessage)
```

---

  API Endpoints

All endpoints on `https://aprhunter.route.com` (or `http://localhost:` locally)

 Health Check
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
    "accountId": ""
  }
}
```

 Get Account Balance
```bash
GET /balance
```

Response:
```json
{
  "success": true,
  "data": {
    "equity": ,
    "margin": ,
    "freeMargin": ,
    "usedMargin": 
  }
}
```

 Get Open Positions
```bash
GET /positions
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "positionId": ,
      "symbol": "BTCUSD",
      "direction": "BUY",
      "volume": .,
      "entryPrice": ,
      "currentPrice": ,
      "pnl": ,
      "stopLoss": ,
      "takeProfit": 
    }
  ]
}
```

 Execute Trade
```bash
POST /trade
Content-Type: application/json

{
  "symbol": "BTCUSD",
  "direction": "BUY",
  "volume": .,
  "sl": ,
  "tp": 
}
```

 Close Position
```bash
POST /close/{positionId}
```

 Close All Positions
```bash
POST /closeall
```

 TradingView Webhook
```bash
POST /webhook
Content-Type: text/plain

BUY BTCUSD SL= TP=
```

---

  Telegram Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `/start` | Welcome message | `/start` |
| `/help` | Show all commands | `/help` |
| `/setchatid` | Register your chat (do this first!) | `/setchatid` |
| `/status` | Account status & daily P&L | `/status` |
| `/balance` | Show equity/margin | `/balance` |
| `/positions` | List open trades | `/positions` |
| `/pause` | Disable new signals | `/pause` |
| `/resume` | Enable signals | `/resume` |
| `/symbols` | List allowed symbols | `/symbols` |
| `/symbols add COIN SIZE` | Add symbol | `/symbols add ETHUSDT .` |
| `/symbols remove COIN` | Remove symbol | `/symbols remove XAGUSD` |
| `/risk daily PCT` | Set daily loss limit | `/risk daily ` |
| `/risk size COIN VOL` | Set lot size | `/risk size BTCUSD .` |
| `/closeall` | Close all positions | `/closeall` |
| `/tv` | TradingView setup guide | `/tv` |

---

  Deployment

 Option : PM (Recommended for Production)

```bash
 Install PM globally
npm install -g pm

 Start bot with PM
pm start ecosystem.config.js

 View logs
pm logs DoochyBot

 Monitor
pm monit

 Stop
pm stop DoochyBot

 Auto-restart on reboot
pm startup
pm save
```

 Option : Docker

```bash
 Build image
docker build -t trading-bot .

 Run container
docker run -d \
  --name trading-bot \
  -p : \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  trading-bot

 View logs
docker logs -f trading-bot

 Stop
docker stop trading-bot
```

 Option : Docker Compose

```bash
 Start
docker-compose up -d

 Logs
docker-compose logs -f

 Stop
docker-compose down
```

---

  Security Considerations

 Before Production:

- [ ] Use strong Telegram bot token
- [ ] Restrict `/setchatid` to authenticated users only
- [ ] Use HTTPS only (nginx with SSL )
- [ ] Keep `.env` secret (never commit to git)
- [ ] Use IP whitelisting if possible
- [ ] Monitor webhook access logs
- [ ] Set rate limits on `/webhook` endpoint

 Production Checklist:

```bash
 Set proper file permissions
chmod  .env
chmod  data/

 Use environment variables, not .env in production
export CTRADER_HOST=...
export CLIENT_ID=...
 ... etc

 Run with PM
pm start ecosystem.config.js --env production
```

---

  Troubleshooting

 Webhook Returns  Bad Gateway

Problem: `https://aprhunter.route.com/webhook` returns 

Solutions:
. Check bot is running: `curl http://localhost:/health`
. Verify nginx config: `sudo nginx -t`
. Check logs: `sudo tail - /var/log/nginx/error.log`
. Restart nginx: `sudo systemctl restart nginx`

 No Telegram Confirmation Appearing

Problem: Webhook receives signal but no Telegram message

Solutions:
. Check `/setchatid` was sent: `cat data/settings.json | grep chatId`
. If empty, send `/setchatid` in Telegram
. Verify bot token is correct in `.env`
. Check logs: `tail -f data/bot.log | grep -i telegram`

 "Unsupported symbol" Error

Problem: Signal rejected because symbol not in whitelist

Solutions:
```bash
 Add symbol via Telegram
/symbols add ETHUSDT .

 Or edit settings.json directly
cat data/settings.json | jq .allowedSymbols
```

 Connection Refused on Port 

Problem: `curl http://localhost:/health` fails

Solutions:
```bash
 Check if bot is running
ps aux | grep "node src"

 Check if port is in use
lsof -i :

 Start bot
npm start
 or
node src/index-test.js
```

 cTrader Authentication Fails

Problem: Logs show "Application auth failed"

Solutions:
. Verify credentials in `.env`
. Check account ID is correct
. Confirm API access is approved
. Test with test mode: `node src/index-test.js`

 -Second Timeout Too Short

Problem: Not enough time to click confirmation button

Solution: Modify in `src/bot/confirm.js` line :
```javascript
const timeout = ; // Change to  for  minutes
```

---

  File Structure

```
ctraderLayer/
 src/
    index.js               Main entry point
    index-test.js          Test mode (no cTrader)
    proxy/
       server.js          Express HTTP server
       connection.js      cTrader connection manager
       heartbeat.js       Keep-alive heartbeats
       routes/
           health.js
           balance.js
           positions.js
           trade.js
           close.js
           webhook.js     TradingView receiver
    bot/
       bot.js             Telegram bot (grammY)
       instance.js        Bot instance holder
       parser.js          Signal parser
       riskGate.js        Risk validation
       confirm.js         TradingView confirmation
       commands/          Telegram command handlers
    utils/
        logger.js          File + console logging
 data/
    settings.json          Configuration (runtime)
    positions.json         Open trades
    tradeLog.json          Trade history
    bot.log               Application logs
 docs/
    TRADINGVIEW-SETUP.md   TradingView integration guide
    TRADINGVIEW-QUICK.md   Quick reference
    TEST-WEBHOOK.md        Testing guide
    DEPLOYMENT.md          Deployment options
 .env                       Environment variables (secret!)
 .env.example              Template
 .gitignore                Git ignore rules
 package.json              Dependencies
 package-lock.json         Lock file
 ecosystem.config.js       PM configuration
 Dockerfile                Container image
 docker-compose.yml        Docker orchestration
 test-webhook.js           CLI webhook tester
 README.md                This file
```

---

  Documentation

- [TRADINGVIEW-SETUP.md](docs/TRADINGVIEW-SETUP.md) - Complete TradingView integration guide
- [TRADINGVIEW-QUICK.md](docs/TRADINGVIEW-QUICK.md) - Quick reference card
- [TEST-WEBHOOK.md](docs/TEST-WEBHOOK.md) - Testing procedures
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment options

---

  Risk Management

The bot validates signals through  sequential checks before execution:

. Paused Check - Is trading paused?
. Symbol Whitelist - Is symbol allowed?
. Weekend Check - No trading on weekends
. Blackout Times - Outside restricted hours?
. Max Positions - Under position limit?
. Max Exposure - Under exposure limit?
. Daily Loss - Not exceeded daily loss limit?
. Duplicate - Not duplicate signal within s?

If any check fails, the signal is rejected and user is notified.

---

  Development

 Local Development

```bash
 Install dev dependencies
npm install --save-dev nodemon

 Run with auto-reload
npx nodemon src/index-test.js

 Test mode allows full development without cTrader
```

 Adding New Commands

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
      await ctx.reply(` Error: ${err.message}`);
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

  Support

Issues?
. Check logs: `tail -f data/bot.log`
. Read [Troubleshooting](troubleshooting)
. Check documentation files in `docs/`
. Verify `.env` configuration

Common Issues:
- See [Troubleshooting](troubleshooting) section above

---

  License

MIT License - See LICENSE file for details

---

  Quick Demo

```bash
 . Start bot in test mode
node src/index-test.js

 . In another terminal, send a test signal
node test-webhook.js "BUY BTCUSD SL= TP="

 . In Telegram, you'll see confirmation (if /setchatid was sent)
 . Click Execute or Cancel

 . Check the position was saved
cat data/positions.json | jq .
```

---

Made with  for automated trading

Questions? Check the `/tv` command in Telegram for setup help!
