# DoochyBot

Telegram-controlled cTrader auto-trader. It takes trade signals, runs them through a risk gate, and places orders on a **demo** Spotware (cTrader Open API) account.

**Signal sources (both feed into the same risk gate and order flow):**
- An RSI signal feed, polled automatically.
- A Telegram channel listener (runs as a separate process) that reads signals from the SureShot Gold channel and forwards them in.

New here? Send `/guide` in Telegram for a step-by-step setup.

---

## Setup

**Requirements:** Node 20+, pnpm, a cTrader **demo** account + Open API app credentials, a Telegram bot token.

```bash
pnpm install
```

### Run

```bash
pnpm dev      # tsx, live from src/ (local development)
pnpm build    # tsc, builds to dist/
pnpm start    # node dist/index.js
```

### Deploy and gotchas (read me, future self)

- **pm2 runs the compiled `dist/`.** After any code change you MUST rebuild before restarting:
  ```bash
  pnpm build && pm2 restart doochybot
  ```
- **The channel listener is a separate process** with its own folder and build:
  ```bash
  cd channel-listener && pnpm build && pm2 restart channel-listener
  ```
- **Demo account means demo host.** The configured account is demo. If `CTRADER_HOST` is `live.ctraderapi.com`, app auth still succeeds but account auth fails with `CANT_ROUTE_REQUEST` and the bot crash-loops. Keep it `demo.ctraderapi.com`. Going live needs real live credentials, not just a host change.

---

## Getting started

The bot will not place any trade until you set a per-trade risk. The quickest path:

```
/risk pertrade 50      # max $ you lose if a trade's stop is hit
/risk sl 0.5           # where the stop sits, as % from entry
/risk tp 0.75          # where the target sits, as % from entry
/symbols add XAUUSD    # choose what to trade
/resume                # make sure trading is active
/status                # confirm everything looks right
```

Send `/guide` any time for the full walkthrough.

---

## Telegram Commands

Only `ALLOWED_USERS` may issue commands.

### Trading control

| Command | Description |
|---------|-------------|
| `/guide` | Step-by-step setup walkthrough |
| `/pause` | Stop executing signals |
| `/resume` | Resume executing signals |
| `/closeall` | Close all open positions immediately |

### Symbols

| Command | Description |
|---------|-------------|
| `/symbols` | List allowed symbols |
| `/symbols add <SYM>` | Add a symbol to the allowed list |
| `/symbols add all` | Add all feed symbols with confidence at least 3 |
| `/symbols remove <SYM>` | Remove a symbol |
| `/symbols reset` | Restore default list (`BTCUSD, XAUUSD, XAGUSD`) |

### Risk and sizing

| Command | Description |
|---------|-------------|
| `/risk pertrade <usd>` | Max $ you lose if a trade's stop is hit. The bot sizes each trade to match. Required to trade (`0` = trading off). |
| `/risk sl <pct>` | Where the stop sits, as % from entry (default `0.5`). Also drives trade size together with pertrade. |
| `/risk tp <pct>` | Where the target sits, as % from entry (default `0.75`). |
| `/risk maxpos <n>` | Max concurrent open positions (default `3`). |
| `/risk maxloss <usd>` | Daily loss limit in $; force-closes everything and stops for the day (default `200`). |
| `/risk cap <usd>` | Daily profit cap: force-closes all positions and blocks new signals once realized + floating P&L reaches this value. `0` = off. |
| `/risk capbuffer <usd>` | Trigger the cap this many $ early so a sub-second price move cannot carry you past it. Recommended: 5 to 10% of the cap. |
| `/risk losses <n>` | SL hits on one symbol within the window that trigger a cooldown. `0` = off (default `3`). |
| `/risk losswindow <min>` | Rolling window for counting SL hits (default `60`). |
| `/risk cooldown <min>` | How long a symbol is paused after the streak (default `120`). |
| `/minhold <secs>` | Seconds to hold a position before the TP is set (default `60`; `0` = immediate). |

### Monitoring

| Command | Description |
|---------|-------------|
| `/status` | Connection health, balance, trading state, realized + floating P&L, profit cap progress, sizing, cooldowns |
| `/positions` | Open positions: direction, symbol, lots, entry, mark price, SL, TP, P&L |
| `/cooldown` | List symbols currently in cooldown with time remaining |
| `/cooldown reset [sym]` | Clear a symbol's cooldown, or all cooldowns |

### History

| Command | Description |
|---------|-------------|
| `/export [from] [to]` | Export trade history as a file |

```
/export                               last 7 days
/export 2026-06-01                    from June 1st to now
/export 2026-06-01 2026-06-05         date range
/export 2026-06-01_00:00 2026-06-05_23:59   with time
```

---

## How it works

### Sizing

Trade size is risk-based. You set `pertrade` (the dollars you are willing to lose if the stop is hit) and `sl` (how far the stop sits from entry). The bot then picks the position size so that hitting the stop loses about that many dollars, whatever the symbol or price. A tighter stop means a bigger position; a wider stop means a smaller one. There is no fixed lot size: if `pertrade` is `0`, the bot does not trade.

### What happens to a signal

Every signal, from either source, goes through the same checks before an order is placed: trading not paused, symbol allowed, no active cooldown on it, under the max-positions limit, not a duplicate of a position already open, and within the daily limits. If it passes, the order goes in and the stop loss and take profit are attached (the take profit is set after the min-hold delay).

### Daily profit cap

Optional, for prop-firm-style profit targets. Once your realized + floating profit reaches the cap, the bot force-closes all positions and stops taking new signals for the rest of the day. It reacts within about a second, and also places a backup target at the broker in case the bot itself is down. Set a small `capbuffer` so a sudden spike cannot carry you past the cap.

Example for a $400 cap:
```
/risk cap 400
/risk capbuffer 20
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `CTRADER_HOST` | `demo.ctraderapi.com` or `live.ctraderapi.com` |
| `CTRADER_PORT` | `5035` |
| `CLIENT_ID` | cTrader Open API app client ID |
| `CLIENT_SECRET` | cTrader Open API app client secret |
| `ACCESS_TOKEN` | OAuth access token for the account |
| `REFRESH_TOKEN` | OAuth refresh token |
| `ACCOUNT_ID` | cTrader trader account ID (numeric) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `ALLOWED_USERS` | Comma-separated Telegram user IDs allowed to send commands |
