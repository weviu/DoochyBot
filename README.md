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
  pnpm build && pm2 restart 0 --update-env
  ```
- **Demo account ⇒ demo host.** The configured account is demo (`isLive: false`, check via `node scripts/lookup-account-id.js`). If `CTRADER_HOST` is `live.ctraderapi.com`, app auth still succeeds but `ProtoOAAccountAuthReq` fails with `CANT_ROUTE_REQUEST` and the bot crash-loops. Keep it `demo.ctraderapi.com`. Going live needs real live credentials, not just a host change.
- **Clean single boot trace** (the crash-loop spam hides errors): `pm2 stop 0` then `node dist/index.js`.

---

## Telegram Commands

Only `ALLOWED_USERS` may issue commands.

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List commands |
| `/pause` | Stop executing signals |
| `/resume` | Resume executing signals |
| `/symbols` | List allowed symbols |
| `/symbols add <SYM>` | Add a symbol |
| `/symbols add all` | Add all feed symbols with confidence ≥ 3 |
| `/symbols remove <SYM>` | Remove a symbol |
| `/symbols reset` | Restore default symbol list (`BTCUSD, XAUUSD, XAGUSD`) |
| `/symbols <SYM> <lots>` | Set per-symbol lot size |
| `/risk lotsize <lots>` | Default lot size (default `0.01`) |
| `/risk sl <pct>` | Stop loss, % of entry (default `0.5`) |
| `/risk tp <pct>` | Take profit, % of entry (default `0.75`) |
| `/risk maxpos <n>` | Max open positions (default `3`) |
| `/risk daily <pct>` | Daily loss limit, % (default `2`) |
| `/risk maxloss <usd>` | Max daily loss, $ (default `200`) |
| `/minhold <secs>` | Delay before TP is set (default `60`; `0` = immediate) |
| `/closeall` | Close all open positions |
| `/export [from] [to]` | Export trade history as a JSON file |

> **Note:** the allowed-symbols list is effectively informational — the gate trades any feed symbol that's available on the broker, regardless of the list.

### `/export`

```
/export                                  last 7 days
/export 2026-06-01                       from June 1st to now
/export 2026-06-01 2026-06-05            date range
/export 2026-06-01_00:00 2026-06-05_23:59   with time
```