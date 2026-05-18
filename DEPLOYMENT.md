# Deployment Guide - Trading Bot

This guide covers running your bot in production using PM2 (bare metal) or Docker (containerized).

---

## 🚀 Quick Start

### Option 1: PM2 (For VPS/Bare Metal)

```bash
# Install PM2 globally
npm install pm2 -g

# Start bot with ecosystem config
pm2 start ecosystem.config.js

# Save to auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs DoochyBot

# Monitor
pm2 monit
```

**Why PM2:**
- ✅ Process management on VPS/Linux servers
- ✅ Auto-restart on crash
- ✅ CPU/memory monitoring
- ✅ Zero downtime restarts
- ✅ Graceful shutdown support (uses SIGTERM)
- ✅ Log rotation built-in

**Best for:** Linode, DigitalOcean, AWS EC2, self-hosted servers

---

### Option 2: Docker (For Cloud/Containerized)

```bash
# Build image
docker build -t trading-bot:latest .

# Or use docker-compose for convenience
docker-compose up -d

# View logs
docker-compose logs -f trading-bot

# Stop (graceful shutdown)
docker-compose down
```

**Why Docker:**
- ✅ Portable across all platforms
- ✅ Kubernetes-ready
- ✅ Environment isolation
- ✅ Easy scaling
- ✅ Cloud providers (AWS, GCP, Azure) have native support
- ✅ Auto-restart via Docker restart policy

**Best for:** AWS ECS, Google Cloud Run, DigitalOcean App Platform, Azure Container Instances, Kubernetes

---

## 📋 Deployment Checklist

Before going live:

- [ ] **Replace placeholder credentials in `.env`**
  ```bash
  CTRADER_HOST=demo.ctraderapi.com (or live.ctraderapi.com)
  CLIENT_ID=your_actual_id
  CLIENT_SECRET=your_actual_secret
  ACCESS_TOKEN=your_actual_token
  REFRESH_TOKEN=your_actual_refresh
  ACCOUNT_ID=your_actual_account_id
  TELEGRAM_BOT_TOKEN=your_telegram_token
  ALLOWED_USERS=123456,789012
  ```

- [ ] **Verify real credentials work**
  ```bash
  # Test locally first
  npm start
  # Should see: "cTrader authentication successful"
  ```

- [ ] **Check graceful shutdown**
  ```bash
  # Start bot
  npm start
  # In another terminal: kill -TERM <pid>
  # Should see: "Received SIGTERM - initiating graceful shutdown..."
  ```

- [ ] **Monitor first 24 hours**
  ```bash
  pm2 logs DoochyBot  # For PM2
  docker-compose logs -f trading-bot  # For Docker
  ```

- [ ] **Test recovery after crash**
  ```bash
  # Kill the process
  pm2 kill  # or docker-compose down
  # Should auto-restart and reconnect
  ```

---

## 🔍 Monitoring & Debugging

### PM2 Dashboard
```bash
# Real-time CPU/memory usage
pm2 monit

# Detailed logs
pm2 logs DoochyBot --err

# Show all running processes
pm2 list
```

### Docker Logs
```bash
# Follow logs in real-time
docker-compose logs -f trading-bot

# Get last 100 lines
docker-compose logs --tail=100 trading-bot

# Show errors only
docker-compose logs trading-bot | grep ERROR
```

### Bot Log File
```bash
# The bot writes to data/bot.log
tail -f data/bot.log
```

---

## 🔧 Troubleshooting

### Bot keeps restarting
- Check authentication errors: `pm2 logs DoochyBot | grep ERROR`
- Verify `.env` credentials are correct
- Ensure cTrader API is reachable: `curl demo.ctraderapi.com:5035`

### High memory usage
- PM2 config has `max_memory_restart: 500M` (restarts if > 500MB)
- Docker has limit of 512MB
- Check for memory leaks: `pm2 monit`

### Proxy not responding
```bash
# Health check the proxy
curl http://localhost:9009/health

# Should return: {"success":true,"connected":true,"authenticated":true}
```

### Not receiving Telegram confirmations
- Verify `chatId` is set: Check `settings.json`
  ```bash
  # Run /setchatid command in Telegram
  # Then verify chatId was saved
  cat data/settings.json | grep chatId
  ```
- Check bot logs for Telegram API errors: `pm2 logs DoochyBot | grep Telegram`

---

## 📊 Performance Considerations

### CPU Usage
- Expected: <1% when idle, <5% during trades
- Exceeds 20%? Check connection issues, restart bot

### Memory Usage
- Expected: 50-100MB baseline
- Grows slowly over days (Node.js memory growth)
- PM2 auto-restart at 500MB

### Network
- Constant WebSocket to cTrader (minimal bandwidth)
- Telegram polling (1-2 req/sec, <1Mbps)
- HTTP webhook for TradingView (only on signals)

---

## 🛡️ Security Best Practices

1. **Never commit `.env`** (add to `.gitignore`)
   ```bash
   # Verify
   git status  # Should not show .env
   ```

2. **Use environment variables** (not hardcoded)
   ```javascript
   // Good
   const token = process.env.TELEGRAM_BOT_TOKEN;
   
   // Bad
   const token = "12345:ABCD...";  // Never!
   ```

3. **Restrict API access**
   - Proxy only listens on `localhost:9009` by default
   - For external webhooks, use reverse proxy (nginx) with authentication

4. **Log rotation** (PM2 + Docker handle this)
   - Logs automatically rotate to prevent disk fill

5. **User permissions** (Docker only runs as `nodejs` user, not root)

---

## 🚨 Emergency Procedures

### Stop bot immediately
```bash
# PM2
pm2 stop DoochyBot

# Docker
docker-compose stop trading-bot
```

### Disable trading (pause flag)
```bash
# Via Telegram: /pause
# Or manual edit:
nano data/settings.json
# Set "paused": true
```

### Kill a hung bot
```bash
# PM2 (force restart)
pm2 kill

# Docker (force remove and restart)
docker-compose down -v
docker-compose up -d
```

---

## 📈 Scaling Beyond Single Bot

### Multiple instances (different accounts)
```bash
# PM2 with multiple apps
pm2 start ecosystem.config.js  # Runs one instance per app config

# Or Docker with multiple containers
docker-compose -f docker-compose.yml -p bot1 up -d
docker-compose -f docker-compose.yml -p bot2 up -d
```

### Load balancing via nginx
```nginx
upstream trading_bots {
    server bot1:9009;
    server bot2:9009;
}

server {
    listen 80;
    location /api {
        proxy_pass http://trading_bots;
    }
}
```

---

## 🎯 When to Use What

| Scenario | Use |
|----------|-----|
| Single VPS, simple setup | **PM2** |
| Kubernetes cluster | **Docker + Helm** |
| AWS/GCP/Azure | **Docker + managed container service** |
| Development/testing | **npm start** (no PM2/Docker) |
| Multiple bots | **Docker Compose** or **PM2 + multiple configs** |
| Need auto-scaling | **Kubernetes** or **serverless** (limited fit for trading) |

---

## ✅ Health Checks

Docker and PM2 include health checks:

**PM2:** Uses HTTP health endpoint (Dockerfile includes HEALTHCHECK)
**Docker:** Checks `GET /health` every 30 seconds

Manual check:
```bash
curl http://localhost:9009/health
```

Expected response:
```json
{
  "success": true,
  "connected": true,
  "authenticated": true,
  "accountId": "123456"
}
```

---

## 📞 Support

If bot crashes:
1. Check logs: `pm2 logs` or `docker-compose logs`
2. Verify credentials in `.env`
3. Test cTrader connectivity: `telnet demo.ctraderapi.com 5035`
4. Check Telegram bot token: Send `/start` in Telegram

