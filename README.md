# DoochyBot

A cTrader trading bot that polls a signal feed, manages risk, executes market orders, and is controlled via Telegram.

## Features

- Connects to cTrader via the Open API (live or demo)
- Polls a signal feed every 10 seconds and executes qualifying signals
- 5-stage risk gate: pause check, symbol allowlist, position limit, daily loss lock, duplicate filter
- Reversal execution: flips an existing position when an opposite signal arrives with higher confidence
- SL/TP amendment after fill, with configurable min-hold timer before TP is set
- Daily P&L tracking with automatic trading lock at configurable loss limit
- Full Telegram bot interface for monitoring and control
- Persists settings and trade history to disk
- Runs in Docker with a single command

---

## Quick Start

### Option 1: Docker (recommended)

```bash
git clone <repo-url>
cd DoochyBot
pnpm install
pnpm run setup
pnpm run docker:build
pnpm run docker:up
```

### Option 2: Run locally

```bash
git clone <repo-url>
cd DoochyBot
pnpm install
pnpm run setup
pnpm start
```

---

## Setup Wizard

`pnpm run setup` walks through five steps:

1. cTrader app credentials (Client ID and Secret)
2. Access and Refresh tokens
3. Account selection (auto-detected or manual)
4. Telegram bot token and allowed user IDs
5. Signal feed URL

Writes `.env` and `.env.docker` on completion.

---

## Environment Variables

| Variable | Description |
|---|---|
| `CTRADER_HOST` | `live.ctraderapi.com` or `demo.ctraderapi.com` |
| `CTRADER_PORT` | `5035` |
| `CLIENT_ID` | cTrader Open API client ID |
| `CLIENT_SECRET` | cTrader Open API client secret |
| `ACCESS_TOKEN` | OAuth access token |
| `REFRESH_TOKEN` | OAuth refresh token |
| `ACCOUNT_ID` | cTrader account ID (numeric) |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `ALLOWED_USERS` | Comma-separated Telegram user IDs |
| `SIGNAL_FEED_ENABLED` | `true` or `false` |
| `SIGNAL_FEED_URL` | URL returning a JSON array of signal alerts |

---

## Telegram Commands

| Command | Description |
|---|---|
| `/status` | Daily P&L, open positions, trading state |
| `/balance` | Equity, balance, margin |
| `/positions` | List open positions with entry price, SL, TP |
| `/pause` | Stop executing new signals |
| `/resume` | Resume signal execution |
| `/closeall` | Close all open positions |
| `/risk daily <pct>` | Set daily loss limit (%) |
| `/risk size <symbol> <lots>` | Set lot size for a symbol |
| `/risk mode <fixed\|percent>` | Set position sizing mode |
| `/risk percent <pct>` | Set risk per trade (%) in percent mode |
| `/risk sltp <auto\|dollar\|pivot>` | Set SL/TP calculation mode |
| `/risk minhold <seconds>` | Delay before TP is set after fill |
| `/symbols` | List allowed symbols with lot sizes |
| `/symbols add all` | Add every symbol available in cTrader (0.01 lot default) |
| `/symbols add <symbol> <lots>` | Add a symbol to the allowlist |
| `/symbols remove <symbol>` | Remove a symbol |
| `/confirm <on\|off>` | Toggle manual confirmation mode |
| `/setchatid` | Save this chat for bot alerts |
| `/export` | Export trade history (last 7 days) |
| `/export <from> <to>` | Export a specific date range |

### SL/TP Modes

| Mode | Behaviour |
|---|---|
| `auto` | Uses signal SL/TP when provided, falls back to dollar mode |
| `dollar` | Calculates SL/TP from fixed USD amounts in settings |
| `pivot` | Trusts signal SL/TP completely |

---

## Signal Feed Format

The bot expects a JSON array at `SIGNAL_FEED_URL`:

```json
[
  {
    "timestamp": "2026-06-07 09:35:46",
    "symbol": "BTC/USDT",
    "timeframe": "5m",
    "direction": "buy",
    "rsi": 42.1,
    "price": 105000,
    "pivot_level": "S1",
    "pivot_distance": 0.12,
    "confidence": 4
  }
]
```

Symbols are resolved automatically: `BTC/USDT` becomes `BTCUSD`, `XAU/USDT` becomes `XAUUSD`, etc.

---

## Docker

```bash
pnpm run docker:build     # Build image
pnpm run docker:up        # Start container (detached)
pnpm run docker:logs      # Follow logs
pnpm run docker:restart   # Restart container
pnpm run docker:down      # Stop and remove container
```

The `data/` directory is mounted as a volume so settings and trade history survive container rebuilds.

---

## Data Files

| File | Description |
|---|---|
| `data/settings.json` | Bot configuration, written by `/risk` and `/symbols` commands |
| `data/tradeLog.jsonl` | Append-only trade history, one JSON record per line |

Both are gitignored and persisted via Docker volume.

---

## Default Settings

| Setting | Default |
|---|---|
| Allowed symbols | BTCUSD, XAUUSD, XAGUSD |
| Max open positions | 5 |
| Daily loss limit | 2% or $200 (whichever is smaller) |
| Sizing mode | Fixed lots |
| SL/TP mode | Auto |
| Min hold before TP | 60 seconds |
| Confirmation mode | Off |

---

## Project Structure

```
src/
  index.js              Entry point
  config.js             Environment config and constants
  state.js              In-memory state (positions, P&L, settings)
  storage.js            Read/write settings.json and tradeLog.jsonl
  startup.js            Sync positions and P&L from cTrader on boot
  ctrader/
    connection.js       WebSocket connect, auth, heartbeat, reconnect
    symbols.js          Fetch symbol list and build name-to-ID map
    account.js          Fetch account balance and equity
    orders.js           Place market orders, wait for fill
    amend.js            Set SL/TP after fill with min-hold timer
    events.js           Listen for position close events
  signals/
    parser.js           Convert raw feed alerts to internal format
    poller.js           Poll signal feed every 10 seconds
  risk/
    gate.js             5-stage risk checks before execution
    reversal.js         Detect and execute position flips
    dailyLoss.js        Track daily P&L and lock on limit breach
  bot/
    bot.js              grammY bot instance and alert sender
    commands/           One file per Telegram command
```
