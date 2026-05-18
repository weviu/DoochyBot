# TradingView Integration Setup

Your bot is ready to receive signals from TradingView! Here's how to set it up.

---

## 🔗 Step 1: Your Public URL

You're all set! You already have a public domain configured:

**Your Webhook URL:**
```
https://aprhunter.route07.com/webhook
```

✅ This URL is ready to receive signals from TradingView

(May need nginx reverse proxy - see DEPLOYMENT.md)

### Option C: Cloudflare Tunnel (Free, No Port Forwarding Needed)

```bash
# Install cloudflared
curl https://pkg.cloudflare.com/cloudflare-release.key | gpg --import -
# Then follow: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Create tunnel
cloudflared tunnel create trading-bot
cloudflared tunnel route dns trading-bot your-domain.com
cloudflared tunnel run trading-bot --url http://localhost:9009
```

---

## 📊 Step 2: Create TradingView Strategy or Alert

### For Existing Strategy:

Add this to your Pine Script strategy:

```pine
alertMessage = "BUY BTCUSD SL=65000 TP=67000"
strategy.entry("Long", strategy.long)
alert(alertMessage)
```

### Using TradingView Alert (Manual Alerts):

1. Go to **Chart Tools** → **Alerts**
2. Click **Create Alert**
3. Configure as shown below

---

## 🔔 Step 3: Configure TradingView Alert

### Alert Settings:

| Field | Value |
|-------|-------|
| **Condition** | Your strategy or condition |
| **Expires in** | Depends on your strategy |
| **Notify on** | Once per bar close (or always) |

### Webhook Settings (Critical):

1. Check: **Webhook URL**
2. Paste your URL: `https://aprhunter.route07.com/webhook`
3. Message format:
   ```
   {{strategy.order.alert_message}}
   ```
   
   OR manually:
   ```
   BUY BTCUSD SL=65000 TP=67000
   ```

### Example Alert Configuration:

```
Condition: Strategy generates signal
Webhook: https://aprhunter.route07.com/webhook
Message: BUY {{ticker}} SL={{close * 0.98}} TP={{close * 1.02}}
```

---

## 📝 Signal Format

Your bot expects signals in this format:

```
BUY BTCUSD SL=65000 TP=67000
SELL XAUUSD SL=2050 TP=2000
LONG EURUSD SL=1.0800 TP=1.1000
SHORT GBPUSD SL=1.2700
```

**Format:** `{DIRECTION} {SYMBOL} SL={STOPLOSS} [TP={TAKEPROFIT}]`

### Fields:

| Field | Required | Example | Notes |
|-------|----------|---------|-------|
| **Direction** | ✅ | BUY, SELL, LONG, SHORT | Case-insensitive |
| **Symbol** | ✅ | BTCUSD, XAUUSD, EURUSD | Must be in allowed list |
| **SL** | ✅ | SL=65000 | Stop loss price |
| **TP** | ❌ | TP=67000 | Take profit (optional) |

### Allowed Symbols (Default):
- BTCUSD
- XAUUSD  
- XAGUSD

*(Add more via `/symbols add SYMBOL VOLUME`)*

---

## 🧪 Step 4: Test the Integration

### 1. Register Chat (One-time)
In Telegram, send:
```
/setchatid
```

### 2. Test with curl

```bash
curl -X POST https://aprhunter.route07.com/webhook \
  -H "Content-Type: text/plain" \
  -d "BUY BTCUSD SL=65000 TP=67000"
```

### 3. Test with Node Script

```bash
node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"
```

### Expected Result:
- ✅ HTTP 200 response
- ✅ Telegram notification with Execute/Cancel buttons
- ✅ You have 60 seconds to click a button

---

## 🔐 Security Considerations

### Current Setup (Testing):
- ✅ Anyone with ngrok URL can send signals
- ⚠️ OK for testing, not production

### Production Hardening:

Add authentication to webhook:

```javascript
// In src/proxy/routes/webhook.js
const validateWebhook = (req, res, next) => {
  const token = req.headers['x-webhook-token'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

this.app.post('/webhook', validateWebhook, webhookRoute(this.connection));
```

Then in TradingView Alert:
```
Headers:
  x-webhook-token: your-secret-token
```

---

## 📺 TradingView Strategy Example

Here's a complete Pine Script example:

```pine
//@version=5
strategy("Trading Bot Signal", overlay=true)

// Buy signal
buySignal = ta.crossover(ta.sma(close, 9), ta.sma(close, 21))
// Sell signal
sellSignal = ta.crossunder(ta.sma(close, 9), ta.sma(close, 21))

// Risk/Reward setup
riskPercent = 2.0
rewardRisk = 2.0

// Calculate SL and TP
sl = close * (1 - riskPercent / 100)
tp = close * (1 + (riskPercent * rewardRisk) / 100)

// Format signals
buyMessage = "BUY " + syminfo.tickerid + " SL=" + str.tostring(math.round(sl, 2)) + " TP=" + str.tostring(math.round(tp, 2))
sellMessage = "SELL " + syminfo.tickerid + " SL=" + str.tostring(math.round(close * 1.02, 2))

// Entry and alerts
if buySignal
    strategy.entry("Buy", strategy.long)
    alert(buyMessage)

if sellSignal
    strategy.entry("Sell", strategy.short)
    alert(sellMessage)
```

**Alert Configuration for This Strategy:**
```
Webhook: https://aprhunter.route07.com/webhook
Message: {{strategy.order.alert_message}}
```

---

## 📊 Testing Checklist

Before going live:

- [ ] ngrok/tunnel running: `ngrok http 9009`
- [ ] Bot running in test mode: `node src/index-test.js`
- [ ] Health check works: `curl https://aprhunter.route07.com/health`
- [ ] Chat registered: Sent `/setchatid` in Telegram
- [ ] Webhook test passes: `curl -X POST https://aprhunter.route07.com/webhook -H "Content-Type: text/plain" -d "BUY BTCUSD SL=65000 TP=67000"`
- [ ] Telegram notification arrives
- [ ] Execute/Cancel buttons appear
- [ ] Clicking button works (updates message)

---

## 🚨 Troubleshooting

### "Failed to connect to server"
- ✅ Check ngrok is running: `ngrok http 9009`
- ✅ Verify URL: `curl https://aprhunter.route07.com/health`

### "Signal passed risk checks but failed to send confirmation"
- ⚠️ chatId not set
- **Fix:** Send `/setchatid` in Telegram
- Verify: `cat data/settings.json | grep chatId`

### "Endpoint not found" (404)
- ⚠️ Using wrong URL
- **Fix:** Check `/webhook` is at the end of URL
- Example: `https://aprhunter.route07.com/webhook` ✅
- Not: `https://aprhunter.route07.com/api/webhook` ❌

### "Unsupported symbol" (403)
- ⚠️ Symbol not in allowed list
- **Fix:** Add symbol via `/symbols add SYMBOL VOLUME`
- Or check: `/symbols` command

### No Telegram notification
- ⚠️ Telegram token invalid or chat ID not set
- **Fix:**
  1. Verify token: `grep TELEGRAM_BOT_TOKEN .env`
  2. Send `/setchatid` in Telegram
  3. Check logs: `tail -f data/bot.log | grep -i telegram`

---

## 🔄 Full Workflow Example

### 1. TradingView Setup
```
Strategy: 9/21 SMA Crossover
Alert: POST to https://aprhunter.route07.com/webhook
Message: BUY BTCUSD SL={{close*0.98}} TP={{close*1.02}}
```

### 2. Signal Arrives
```
Webhook receives: "BUY BTCUSD SL=65000 TP=67000"
```

### 3. Bot Processes
```
✅ Parse: BUY, BTCUSD, SL=65000, TP=67000
✅ Risk gate: All checks pass
✅ Send Telegram: Confirmation buttons appear
```

### 4. User Action (60 second timeout)
```
Click ✅ Execute
→ Fake trade created
→ Position saved
→ Message updates with confirmation
```

### 5. Production (When cTrader API Ready)
```
Switch to: npm start
→ Real cTrader connection
→ Real trades execute
→ Same Telegram confirmation flow
```

---

## 📞 Next Steps

1. **Setup ngrok:** `ngrok http 9009`
2. **Register chat:** Send `/setchatid` in Telegram
3. **Create TradingView alert** with webhook URL
4. **Test signal:** `node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"`
5. **Go live:** When cTrader confirms, switch to `npm start`

---

**Questions?**
- Check logs: `tail -f data/bot.log`
- Test health: `curl https://your-ngrok-url/health`
- View positions: `cat data/positions.json | jq .`

