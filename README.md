# DoochyBot

Telegram-controlled cTrader auto-trader driven by an RSI signal feed. Trades a **demo** Spotware (cTrader Open API) account.

Flow: `signal feed → poller → parser → risk gate → order execution → SL/TP amend`

---

## Setup

**Requirements:** Node 20+, pnpm, a cTrader **demo** account + Open API app credentials, a Telegram bot token.

```bash
pnpm install
```

### Run

```bash
pnpm dev      # tsx, live from src/ (local development)
pnpm build    # tsc → dist/
pnpm start    # node dist/index.js
```

### Deploy & gotchas (read me, future self)

- **pm2 runs the compiled `dist/`** (process id `0`). After any `src/` change you MUST:
  ```bash
  pnpm build && pm2 restart 0
  ```
- **Demo account ⇒ demo host.** The configured account is demo (`isLive: false`, check via `node scripts/lookup-account-id.js`). If `CTRADER_HOST` is `live.ctraderapi.com`, app auth still succeeds but `ProtoOAAccountAuthReq` fails with `CANT_ROUTE_REQUEST` and the bot crash-loops. Keep it `demo.ctraderapi.com`. Going live needs real live credentials, not just a host change.
- **Clean single boot trace** (the crash-loop spam hides errors): `pm2 stop 0` then `node dist/index.js`.

---

## Telegram Commands

Only `ALLOWED_USERS` may issue commands.

### Trading control

| Command | Description |
|---------|-------------|
| `/pause` | Stop executing signals |
| `/resume` | Resume executing signals |
| `/closeall` | Close all open positions immediately |

### Symbols

| Command | Description |
|---------|-------------|
| `/symbols` | List allowed symbols with per-symbol lot sizes |
| `/symbols add <SYM>` | Add a symbol to the allowed list |
| `/symbols add all` | Add all feed symbols with confidence ≥ 3 |
| `/symbols remove <SYM>` | Remove a symbol |
| `/symbols reset` | Restore default list (`BTCUSD, XAUUSD, XAGUSD`) |
| `/symbols <SYM> <lots>` | Set per-symbol lot size override |

### Risk settings

| Command | Description |
|---------|-------------|
| `/risk lotsize <lots>` | Default lot size (default `0.01`) |
| `/risk sl <pct>` | Stop loss % of entry (default `0.5`) |
| `/risk tp <pct>` | Take profit % of entry (default `0.75`) |
| `/risk maxpos <n>` | Max concurrent open positions (default `3`) |
| `/risk daily <pct>` | Daily loss limit % (default `2`) |
| `/risk maxloss <usd>` | Max daily loss $ (default `200`) |
| `/risk cap <usd>` | **Daily profit cap:** force-closes all positions & blocks new signals once realized + floating P&L reaches this value. `0` = off. |
| `/risk capbuffer <usd>` | Trigger force-close at `cap − buffer` so a sub-second price move can't carry realized over the cap. Recommended: 5–10% of cap. |
| `/risk trend <hours>` | Higher-timeframe trend filter: only take signals aligned with the N-hour price trend. `0` = off (default `4`). |
| `/risk losses <n>` | SL hits on one symbol within the window that trigger a cooldown. `0` = off (default `3`). |
| `/risk losswindow <min>` | Rolling window for counting SL hits (default `60`). |
| `/risk cooldown <min>` | How long a symbol is paused after the streak (default `120`). |
| `/minhold <secs>` | Seconds to hold a position before the TP is set (default `60`; `0` = immediate). |

### Monitoring

| Command | Description |
|---------|-------------|
| `/status` | Connection health, balance, trading state, realized + floating P&L, profit cap progress, trend filter, cooldowns |
| `/balance` | Account balance |
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

## Architecture

### Signal flow

```
HTTP poll (signals.route07.com)
  → ParsedSignal
  → risk/gate.ts
      1. Paused?
      2. Allowed symbol?
      3. Trend filter (4h default)
      4. Consecutive-loss cooldown
      5. Max positions
      6. One position per symbol
      7. Confidence flip check (opposite direction)
      8. Daily limits (realized + floating)
  → ctrader/orders.ts → ProtoOANewOrderReq
  → ctrader/amend.ts  → ProtoOAAmendPositionSLTPReq (SL immediately, TP after minhold)
```

### Daily profit cap (prop-firm safe)

The cap has three enforcement layers, in order of reaction speed:

1. **1s monitor** (`risk/capMonitor.ts`) — polls live realized + floating P&L. Force-closes all positions within ~1s of breach. Primary enforcement.
2. **Broker-side cap TP** — each position gets a TP at `(remaining headroom ÷ open-position count) / units` above/below entry. Protects against the bot being down; the broker executes it instantly even on a spike.
3. **Gate check** — blocks new signals once daily limits are breached.

Set a `capbuffer` to absorb sub-second slippage. For a prop-firm 40% best-day rule on a $1000 target ($400 cap), recommended config:
```
/risk cap 400
/risk capbuffer 20
```

### Live price feed

Floating P&L uses cTrader's `ProtoOASpotEvent` stream (persistent spot subscription per open symbol). This is the same price source the broker's "Net USD" column uses. The HTTP signal feed is **not** used for P&L — it only updates prices when an RSI alert fires for that specific symbol.

### Position tracking

All open positions are stored in `state.positions: Map<number, Position>` (keyed by numeric positionId). On restart, `reconcilePositions()` rehydrates from the broker so the bot can manage positions it didn't open this session.

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
