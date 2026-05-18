# TradingView Setup - Quick Reference

Your bot is ready for TradingView signals! Here's the complete setup in under 5 minutes.

---

## 📱 Telegram Commands

**In Telegram, send:**

| Command | Purpose |
|---------|---------|
| `/start` | Welcome message |
| `/setchatid` | ⚡ **DO THIS FIRST** - Register your chat |
| `/tv` | Show TradingView setup instructions |
| `/help` | Show all commands |
| `/status` | Check bot status |
| `/positions` | View open positions |
| `/symbols` | List allowed trading symbols |

---

## 🚀 Setup (3 Steps)

### 1. Open Telegram
Send `/setchatid` to register your chat
- Bot responds: "Chat ID saved!"

### 2. Your Webhook URL
```
https://aprhunter.route07.com/webhook
```

### 3. Go to TradingView & Add Alert
Create Alert with:
- **Webhook URL:** `https://aprhunter.route07.com/webhook`
- **Message:** `BUY BTCUSD SL=65000 TP=67000`

**Test it:**
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

Expected: ✅ Telegram notification appears with Execute/Cancel buttons

---

## 💡 Signal Format

Send signals like this:
```
BUY SYMBOL SL=PRICE [TP=PRICE]
SELL SYMBOL SL=PRICE [TP=PRICE]
LONG SYMBOL SL=PRICE [TP=PRICE]
SHORT SYMBOL SL=PRICE [TP=PRICE]
```

**Examples:**
```
BUY BTCUSD SL=65000 TP=67000
SELL XAUUSD SL=2050
LONG EURUSD SL=1.0800
SHORT GBPUSD SL=1.2700 TP=1.2500
```

**Requirements:**
- ✅ Direction: BUY, SELL, LONG, or SHORT
- ✅ Symbol: Must be in allowed list
- ✅ Stop Loss (SL): Required
- ❌ Take Profit (TP): Optional

**Allowed Symbols:**
- BTCUSD
- XAUUSD
- XAGUSD

*(Add more: `/symbols add ETHUSDT 0.1`)*

---

## 🔗 Integration Methods

### Method 1: TradingView Strategy Alert
In your Pine Script:
```pine
alertMessage = "BUY BTCUSD SL=65000 TP=67000"
strategy.entry("Long", strategy.long)
alert(alertMessage)
```

Then create alert with:
```
Webhook: https://aprhunter.route07.com/webhook
Message: {{strategy.order.alert_message}}
```

### Method 2: Manual TradingView Alerts
1. Chart → Alerts → Create Alert
2. Webhook: `https://aprhunter.route07.com/webhook`
3. Message: `BUY BTCUSD SL=65000 TP=67000`

### Method 3: Curl (Testing)
```bash
curl -X POST https://aprhunter.route07.com/webhook \
  -H "Content-Type: text/plain" \
  -d "BUY BTCUSD SL=65000 TP=67000"
```

### Method 4: Script (Node)
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

---

## ✅ Signal Flow

```
1. TradingView Alert Triggers
        ↓
2. Signal Sent to: https://xxxx-yyyy.ngrok.io/webhook
        ↓
3. Bot Receives: "BUY BTCUSD SL=65000 TP=67000"
        ↓
4. Risk Gate Checks: ✓ Not paused ✓ Valid symbol ✓ Max positions OK
        ↓
5. Telegram Notification: Shows Execute/Cancel buttons
        ↓
6. User Clicks: Execute ✅
        ↓
7. Trade Executed: Position saved to positions.json
        ↓
8. Confirmation: Message updates with order details
```

---

## 🧪 Test It Now!

**Terminal 1:** Watch logs
```bash
tail -f data/bot.log | grep -i "webhook\|telegram"
```

**Terminal 2:** Send test signal
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

**Terminal 3:** Check position saved
```bash
cat data/positions.json | jq .
```

**Telegram:** You should see the confirmation message

---

## ⚙️ Configuration

### Change Allowed Symbols
In Telegram:
```
/symbols
/symbols add ETHUSDT 0.1
/symbols remove XAGUSD
```

### Set Lot Sizes
```
/symbols
/risk size BTCUSD 0.05
```

### Set Daily Loss Limit
```
/risk daily 5
```
*(Stops trading if daily loss > 5%)*

---

## 🔐 Security Notes

**Current Setup (Testing):**
- Anyone with ngrok URL can send signals
- ⚠️ OK for testing only

**Production Recommendations:**
1. Use real domain (not ngrok)
2. Add authentication token
3. Use HTTPS (ngrok uses HTTPS by default ✅)
4. Restrict allowed IPs if possible
5. Use strong Telegram token ✅

---

## 🚨 Troubleshooting

### "Can't connect to server"
```bash
# Test webhook endpoint
curl https://aprhunter.route07.com/health

# Check bot is running locally
curl http://localhost:9009/health
```

### "No Telegram notification"
```bash
# 1. Verify chatId was set
cat data/settings.json | grep chatId

# 2. If empty, send in Telegram:
/setchatid

# 3. Check logs
tail -f data/bot.log | grep -i error
```

### "Unsupported symbol" error
```bash
# Add the symbol first
/symbols add ETHUSDT 0.1

# Or use default symbols:
BTCUSD, XAUUSD, XAGUSD
```

### "Only 60 seconds to click"
The button expires after 60 seconds. Need another confirmation? Just send the signal again!

---

## 🔄 When cTrader API Ready

Once cTrader approves:
1. Update `.env` with access token
2. Stop test mode: `Ctrl+C`
3. Start production: `npm start`
4. Real trades execute instead of test trades
5. Same Telegram confirmation flow

---

## 📚 Full Documentation

For more details, see these files in your repo:

- **[TRADINGVIEW-SETUP.md](TRADINGVIEW-SETUP.md)** - Detailed setup guide
- **[TEST-WEBHOOK.md](TEST-WEBHOOK.md)** - Testing guide
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment

---

## 🆘 Quick Commands

```bash
# Start test mode
node src/index-test.js

# Test webhook
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"

# Watch logs
tail -f data/bot.log

# Check health
curl http://localhost:9009/health

# View positions
cat data/positions.json | jq .

# View settings
cat data/settings.json | jq .
```

---

**Ready? Send `/setchatid` in Telegram to get started!**
