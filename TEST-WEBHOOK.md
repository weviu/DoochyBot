# TradingView Webhook Testing Guide

**Status:** Waiting for cTrader Open API confirmation  
**Current:** Testing TradingView webhook integration without cTrader

---

## 🚀 Quick Start

### 1. Start Bot in Test Mode
```bash
node src/index-test.js
```

Expected output:
```
✅ Proxy running on port 9009
✅ Telegram bot active

═══════════════════════════════════════════════════════════
🧪 TEST MODE ACTIVE
═══════════════════════════════════════════════════════════
📊 Proxy endpoint:  http://localhost:9009
🤖 Telegram token:  8966054029:AAF3bmp1...
👥 Allowed users:   555334666, 354672750

💡 Test the webhook:
   curl -X POST http://localhost:9009/webhook \
        -H "Content-Type: text/plain" \
        -d "BUY BTCUSD SL=65000 TP=67000"

📱 In Telegram: Send /setchatid to register your chat
                Then send signals or use webhooks
═══════════════════════════════════════════════════════════
```

### 2. Configure Telegram Chat (One-time Setup)
In Telegram with your bot:
```
/setchatid
```
This saves your chat ID for webhook confirmations.

### 3. Test Webhook via Node Script
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

Or test via curl:
```bash
curl -X POST http://localhost:9009/webhook \
  -H "Content-Type: text/plain" \
  -d "BUY BTCUSD SL=65000 TP=67000"
```

---

## 📋 Test Scenarios

### Scenario 1: Basic Signal
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```
Expected:
- ✅ Telegram notification with Execute/Cancel buttons
- ⏱️ 60-second timeout
- When executed: Mock trade creates fake position

### Scenario 2: Missing Stop Loss (Should Fail)
```bash
node test-webhook.js "BUY BTCUSD TP=67000"
```
Expected:
- ❌ HTTP 400 error
- ❌ No Telegram notification
- Reason: SL is required

### Scenario 3: Unsupported Symbol (Risk Gate Check)
```bash
node test-webhook.js "BUY AAPL SL=150 TP=160"
```
Expected:
- ❌ HTTP 403 error (rejected by risk gate)
- Reason: AAPL not in allowed symbols

Allowed symbols (from settings.json):
- BTCUSD
- XAUUSD
- XAGUSD

### Scenario 4: Cancel Signal
```bash
# Send signal
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"

# In Telegram: Click ❌ Cancel button
```
Expected:
- ✅ Message updates to show "Trade cancelled by user"
- ❌ No trade execution

### Scenario 5: Execute Signal
```bash
# Send signal
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"

# In Telegram: Click ✅ Execute button
```
Expected:
- ✅ Message updates: "✅ TradingView Trade Executed"
- ✅ Position appears in positions.json
- ✅ Shows entry price, order ID

### Scenario 6: Timeout (60 seconds)
```bash
# Send signal
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"

# Wait 60 seconds without clicking
```
Expected:
- ⏱️ Message updates: "⏱️ Signal confirmation expired (60s timeout)"
- ❌ Buttons disappear
- ❌ No trade execution

---

## 🔍 Monitoring

### Terminal 1: Watch Bot Logs
```bash
tail -f data/bot.log
```

### Terminal 2: Check Positions
```bash
# After executing a trade:
cat data/positions.json | jq .
```

### Terminal 3: Send Signals
```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

---

## 🧪 Webhook Request Examples

### Via curl (raw text)
```bash
curl -X POST http://localhost:9009/webhook \
  -H "Content-Type: text/plain" \
  -d "BUY BTCUSD SL=65000 TP=67000"
```

### Via curl (TradingView Alert Format)
```bash
curl -X POST http://localhost:9009/webhook \
  -H "Content-Type: text/plain" \
  -d "{{strategy.order.alert_message}}"
```
*(Use this in TradingView Alert dialog)*

### Via Python (for scripting)
```python
import requests

signal = "BUY BTCUSD SL=65000 TP=67000"
response = requests.post(
    "http://localhost:9009/webhook",
    data=signal,
    headers={"Content-Type": "text/plain"}
)
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
```

### Via JavaScript (fetch)
```javascript
const signal = "BUY BTCUSD SL=65000 TP=67000";
const response = await fetch("http://localhost:9009/webhook", {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: signal
});
const data = await response.json();
console.log(data);
```

---

## 📊 Test Coverage Checklist

- [ ] Bot starts in test mode
- [ ] Proxy listens on port 9009
- [ ] Telegram bot connects and polls
- [ ] `/setchatid` saves chat ID to settings.json
- [ ] Webhook accepts text/plain signals
- [ ] Valid signal → Telegram notification
- [ ] Invalid signal → HTTP error
- [ ] Execute button → fake trade executed
- [ ] Cancel button → message updates
- [ ] 60s timeout → message updates
- [ ] Positions saved to positions.json
- [ ] Risk gate checks work (reject unsupported symbols)

---

## ⚙️ Configuration for Testing

Check these files to customize test behavior:

**data/settings.json** - Trading rules
```json
{
  "allowedSymbols": ["BTCUSD", "XAUUSD", "XAGUSD"],
  "symbolLotSizes": {
    "BTCUSD": 0.01,
    "XAUUSD": 0.05,
    "XAGUSD": 0.1
  },
  "maxPositions": 3,
  "maxTotalExposure": 1.0,
  "dailyLossLimit": 5,
  "chatId": "YOUR_CHAT_ID_HERE"
}
```

**Add test symbols:**
```bash
# In Telegram:
/symbols add ETHUSDT 0.1
/symbols add LTCUSDT 0.5
```

---

## 🐛 Debugging

### Bot won't start
```bash
# Check logs
node src/index-test.js 2>&1 | head -50

# Verify Telegram token is correct
grep TELEGRAM_BOT_TOKEN .env
```

### Webhook doesn't respond
```bash
# Check if proxy is listening
curl http://localhost:9009/health

# Should return: {"success":true,"connected":true}
```

### No Telegram notification
```bash
# Verify chat ID is set
cat data/settings.json | grep chatId

# If empty:
# 1. Send /setchatid in Telegram
# 2. Verify it saved: cat data/settings.json | grep chatId
```

### Position not saved
```bash
# Check if trade executed
cat data/positions.json

# Check bot logs for errors
grep -i "error\|failed" data/bot.log | tail -20
```

---

## 🔄 Integration with TradingView (When Ready)

Once testing is complete, add webhook to TradingView strategy:

1. Get your public URL:
   ```bash
   # Using ngrok (tunneling to localhost)
   ngrok http 9009
   # Output: https://xxxx-xxxx.ngrok.io
   ```

2. In TradingView Alert:
   ```
   Webhook URL: https://xxxx-xxxx.ngrok.io/webhook
   Message: {{strategy.order.alert_message}}
   ```

3. Example Pine Script:
   ```pine
   strategy.entry("Buy", strategy.long)
   alert("BUY BTCUSD SL=65000 TP=67000")
   ```

---

## 📝 When cTrader Opens API Access

Once cTrader confirms:

1. Update .env with real credentials:
   ```
   ACCESS_TOKEN=real_token
   REFRESH_TOKEN=real_refresh
   ```

2. Switch to production mode:
   ```bash
   npm start  # Uses src/index.js (real cTrader connection)
   ```

3. Real trades will execute instead of mocks

---

**Need help?**
- Check logs: `tail -f data/bot.log`
- Verify connection: `curl http://localhost:9009/health`
- Test signal: `node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"`

