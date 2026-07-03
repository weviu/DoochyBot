# DoochyBot: Project Summary

A comprehensive reference for DoochyBot as it exists in the codebase today. It describes what the bot does, how the pieces fit together, and the risk model, so a new reader (or future self) can understand the system without reading every source file. Where behaviour has changed from older notes, the current behaviour is what is documented here.

Last reviewed against source: main branch, commit d122b1d ("Add: Stop limit prevention").

---

## 1. What it is

DoochyBot is an automated trading bot for the cTrader platform (Spotware Open API), controlled and monitored entirely through Telegram. It ingests third-party trade signals, runs each one through a multi-stage risk gate, and places orders on a cTrader account (demo or live by host configuration). Stop loss and take profit come from the signal itself; the bot sizes each position by risk and enforces a layer of daily and per-trade-idea safety controls designed to keep a funded/prop account inside its rules (for example InstantFunding).

The bot generates no signals and runs no trend analysis of its own. Signal quality is entirely the responsibility of the upstream sources.

---

## 2. Architecture

Two independent Node.js processes, both managed by pm2 ([ecosystem.config.js](ecosystem.config.js)):

1. **Main bot ([src/](src/))**: opens the cTrader Open API connection, runs the Telegram command bot, polls the RSI signal feed, exposes a loopback webhook, and owns all sizing, order execution, position tracking, and risk logic.
2. **Channel listener ([channel-listener/](channel-listener/))**: a separate process with its own dependencies and build. It logs into Telegram as a real user account (MTProto via gramJS), reads one or more signal channels, parses their messages, and POSTs the parsed signals to the main bot's webhook. It shares no code or state with the main bot, only the webhook URL.

Communication is one-way: listener to main bot over local HTTP. If either process dies, the other keeps running; pm2 restarts both on crash.

### Tech stack

- Node.js 20+, TypeScript (CommonJS, compiled to `dist/` with `tsc`).
- Main bot dependencies: `@reiryoku/ctrader-layer` (cTrader Open API protobuf client), `grammy` (Telegram bot framework), `express` (webhook server), `dotenv`.
- Channel listener dependency: `telegram` (gramJS MTProto client) as its only runtime dependency, plus a minimal inline `.env` loader and Node's `readline`.
- Tooling: `tsx` (dev runner), `pm2` (process manager), `typescript`.
- Persistence: a single JSON file ([data/settings.json](data/settings.json)). No database.

### Boot sequence (main process, [src/index.ts](src/index.ts))

1. Load settings and restore runtime state (active cooldowns and any daily-limit lock) from `data/settings.json`.
2. Connect to cTrader: open socket, application auth, account auth. A 10-second heartbeat keeps the push channel alive (the Open API drops execution events if idle for about 10 seconds).
3. Fetch account info (balance) and the symbol list (name to symbolId map, plus quote-currency data).
4. Pre-subscribe spot price streams for every allowed symbol so risk-based sizing has a live mark for the first trade.
5. Seed today's realized P&L from the broker (retried once; if both attempts fail, daily limits are disabled for the session rather than run against a false zero).
6. Reconcile open positions from the broker (rehydrates positions opened before a restart).
7. Subscribe spot streams for already-open positions.
8. Start background safety timers: midnight closer, daily reset, profit-cap monitor, daily-loss monitor, SL watchdog.
9. Start the Telegram bot, the RSI poller, and the webhook server.

---

## 3. Signal sources

All sources converge on one entry point: `processSignal` in [src/risk/gate.ts](src/risk/gate.ts). A signal is a `ParsedSignal` (see [src/signals/types.ts](src/signals/types.ts)) carrying symbol, direction, absolute SL and TP price levels, confidence, and optional order-type hints.

### 3.1 RSI JSON feed (poller)

- Source: `https://signals.route07.com/alerts.json`, polled every 10 seconds ([src/signals/poller.ts](src/signals/poller.ts)). The URL and interval are hardcoded.
- On first poll it records the latest timestamp and processes nothing (avoids replaying history). Thereafter, any alert newer than the last seen timestamp is processed oldest-first.
- Each alert ([src/signals/parser.ts](src/signals/parser.ts)) carries `timestamp`, `symbol`, `timeframe`, `direction`, `rsi`, `price` (the target), `sl`, `tp`, `confidence`, and `btc_state` (BTC's higher-timeframe macro state, or null for non-crypto).
- Symbol resolution: a few explicit aliases (AAVE to AAVUSD, LINK to LNKUSD, US30 to "US 30", US100 to "US TECH 100", and similar); otherwise the base symbol is used as-is or gets a USD suffix.
- Feed signals carry their own SL and TP (the scanner's structural levels). They are the source of truth for both order placement and sizing.

### 3.2 Signal channels (channel listener)

- A gramJS user client logs in as a Telegram account that is a member of the configured channels ([channel-listener/src/index.ts](channel-listener/src/index.ts)).
- Multi-channel: each channel is configured with a parser. Two parsers exist:
  - `sureshot`: stateful, buffers a multi-message signal (a symbol/direction/price start line, then `SL:` and `TP:` lines across follow-up messages) ([channel-listener/src/parser.ts](channel-listener/src/parser.ts)).
  - `fxoro`: stateless single-message parser ([channel-listener/src/parsers/fxoro.ts](channel-listener/src/parsers/fxoro.ts)).
- Two delivery paths feed one deduplicated handler per channel: instant push updates, plus a periodic poll of recent messages as a reliability net (a single channel's push stream can silently desync). Messages are deduplicated by id, so nothing is processed twice.
- The parsed signal is POSTed to the main bot's webhook as plain text. Channel signals may include a LIMIT keyword and price to request a resting entry.

### 3.3 Local webhook

- An Express server in the main process listens on loopback only, route `POST /webhook` ([src/webhook.ts](src/webhook.ts)). No authentication; it is never exposed to the internet.
- Accepts DoochyBot's plain-text signal format (market: `SELL XAUUSD SL=... TP=...`; limit: `SELL XAUUSD LIMIT=... SL=... TP=...`), parses it into a `ParsedSignal`, and calls the same `processSignal` gate the poller uses.
- Returns 400 if unparseable, 200 with a rejection reason if the gate rejects, 200 with a success message if it begins executing.

### 3.4 Manual Telegram orders

- Typed directly into chat as `BUY|SELL <symbol> <lots> [entry] <TP> <SL>` (no slash). Matched by [src/bot/commands/order.ts](src/bot/commands/order.ts).
- Uses the exact lot size the user typed (verbatim, snapped to the broker's volume grid); it bypasses risk-based sizing, the margin cap, and the signal gate. TP/SL are absolute prices; the symbol must be on the allowed list.

---

## 4. The risk gate

Every non-manual signal passes through `processSignal`. Checks run in order; the first failure rejects the signal and returns a reason. Before any check, a signal notification may be sent (independent of execution) so the user can trade a signal manually elsewhere even when this account skips it.

1. **Trading paused** (`/pause`).
2. **SL and TP mandatory**: a signal missing either is rejected. Both drive execution now: the SL sets position size, the TP is the exit. There is no guessed-stop fallback.
3. **Re-entry cooldown after a loss**: if this exact symbol and direction had a losing close within `reentryCooldownMinutes`, reject. Opposite direction and prior wins are unaffected. (Prop-firm same-trade-idea rule.)
4. **Combined per-trade-idea risk**: sum the potential loss of all open positions of the same symbol and direction; reject if adding this signal would exceed `maxCombinedRiskUSD`. Existing positions use their exact stored SL distance; the new one is estimated at `riskPerTradeUSD`. Skipped when 0.
5. **Symbol whitelist**: reject if not in `allowedSymbols`.
6. **Symbol available on broker**: reject if not in the broker's symbol map.
7. **USD-quoted only**: reject any symbol whose quote currency is not USD. The entire money model (sizing, floating P&L, daily limits) assumes a USD quote; a non-USD pair like GBPJPY would be mis-valued by roughly the cross rate. Fails open if asset data has not loaded.
8. **Minimum confidence** (feed only): reject feed signals scoring below `minConfidence`. Channel signals carry the channel confidence and bypass this (analyst-curated, not an algorithmic score). 0 disables.
9. **BTC macro-bias gate** (crypto BUYs only): when BTC's higher-timeframe state is BEARISH or BEARISH_STRONG, a crypto BUY needs confidence at or above the configured floor to pass. SELLs and non-crypto (null btc_state) are unaffected.
10. **Per-symbol consecutive-loss cooldown**: a symbol that took too many SL hits in a rolling window is paused for a cooldown. Distinct from the re-entry cooldown (this is per symbol, either direction).
11. **One position per symbol / reversal**: if a position already exists on the symbol:
    - Same direction: reject ("Already holding"). The gate never stacks same-direction positions.
    - Opposite direction: flip if the new signal's confidence is at least equal to the open position's (equal flips, because the newer signal is the source's updated view). Otherwise reject. A flip triggers a reversal (close then open).
12. **Pending order for same symbol and direction**: reject if an order is already submitted and awaiting fill, so a repeating signal does not submit duplicates.
13. **Max positions** (`maxPositions`).
14. **Daily limit lock**: re-evaluate daily limits; reject if locked by the daily loss limit or profit cap.
15. **Duplicate within 60 seconds**: reject a repeat of the same symbol and direction within 60 seconds.

If all checks pass, the signal is sized and executed.

---

## 5. Order execution and sizing

Handled in [src/ctrader/orders.ts](src/ctrader/orders.ts).

### Risk-based sizing

- Sizing is risk-based only; there is no fixed-lot mode for signals. Volume is computed so that the signal's own entry-to-SL price distance loses approximately `riskPerTradeUSD`, using the money model `dollarPnL = priceDiff * volumeCents / 100`. A tighter stop yields a bigger position, a wider stop a smaller one. The result is snapped to the broker's min, step, and max volume.
- Because sizing measures the actual SL distance from the signal, a channel or feed order's real risk tracks the true stop rather than a fixed percentage.
- If `riskPerTradeUSD` is 0, the signal carries no SL, or no entry price is resolvable, the trade is refused rather than sent unsized.
- **Margin-aware cap** (`/risk marginaware`, default on): risk sizing ignores margin, so a tight stop on a low-leverage symbol can demand more margin than the account can post (broker rejects with NOT_ENOUGH_MONEY). When on, each order is capped to an equal share of `MARGIN_CAP_FRACTION` (0.8) of equity divided across `maxPositions`, using the broker's expected-margin query. If even the minimum size will not fit, the trade is skipped with a Telegram note. Fails safe to the risk size if the margin figure is unavailable.
- **Overrun guard** (`/risk overrun`, default 20 percent): a wide stop can make the risk size so small that the broker's minimum lot floors it above target. A trade whose real risk exceeds `riskPerTradeUSD` by more than the overrun percentage is skipped rather than silently over-risking a prop account.

### Three-way execution (feed signals)

For a feed signal (no explicit order type), the bot decides the order type at execution time using its own live mark versus the signal's target price (`ENTRY_TOLERANCE_PERCENT` = 0.15 percent):

- Target within tolerance of live: MARKET (immediate fill).
- Target the market must rise to: BUY buy-STOP / SELL sell-LIMIT.
- Target the market must fall to: BUY buy-LIMIT / SELL sell-STOP.

Both non-market legs rest at the target and fill only when price reaches it (no fill, no trade if it never arrives). This keeps SL and TP on the correct side of the fill in every path. With no live quote, it defaults to MARKET.

### Market vs resting orders

- **Market orders**: sent IMMEDIATE_OR_CANCEL. The bot waits up to 30 seconds for a fill; on timeout it cancels the still-resting order at the broker. SL is applied on fill by amending the position ([src/ctrader/amend.ts](src/ctrader/amend.ts)); TP is delayed until the min-hold timer elapses.
- **Resting orders** (channel/manual LIMIT entries, and feed STOP/LIMIT breakouts): placed with SL and TP attached to the order itself, so the resting order is self-contained and protected even across a bot restart. The bot waits only for the order to be accepted (resting) or rejected, then returns; a persistent listener records the position when it eventually fills. Wrong-side SL or TP is dropped so the broker does not reject the whole order.

### Stale-order guard (feed resting orders)

- `/risk stalebars` (default 3): a feed stop/limit order that has not filled within N bars of the signal's timeframe (for example 3 x 30m = 90m) is set GOOD_TILL_DATE so the broker expires it. Channel and manual resting entries stay GOOD_TILL_CANCEL. 0 disables.

### Cap-aware TP

- When a daily profit cap is set, the amend logic may tighten a position's TP to a "cap TP" so the position closes at the remaining daily headroom (split across open positions). This is a broker-side backstop that fires even if the bot is offline. When a position closes and headroom shifts, remaining positions are re-amended.

### Startup reconciliation

- On boot, `reconcilePositions()` reads open positions from the broker and rebuilds the in-memory map, but only for allowed, USD-quoted symbols (the same account may be traded manually in other instruments, which the bot must not adopt or mis-value). Reconciled positions keep whatever broker-side SL/TP they already had.

---

## 6. Position management

- **In-memory tracking**: open positions are held in a map keyed by broker position id, each with symbol, direction, lots and broker volume, entry, open time, confidence, and SL/TP. Per-position P&L is computed live from the cTrader spot stream.
- **Reversal** ([src/risk/reversal.ts](src/risk/reversal.ts)): on an opposite-direction signal that clears the confidence bar, the bot closes the existing position, waits about a second for the broker to settle, then opens the new one. If the close succeeds but the open fails, it sends a CRITICAL Telegram alert (account may be unhedged).
- **closeall**: `/closeall` closes every open position one at a time and reports how many closed and failed. The same routine backs the midnight closer and the daily-limit force-close.
- **P&L**: realized daily P&L is seeded from the broker at boot, updated on each close, and reset at 00:00 UTC. Floating P&L is summed live from spot prices.

---

## 7. Telegram commands

Only Telegram user IDs in `ALLOWED_USERS` may issue commands; others get "Unauthorized". Command implementations live in [src/bot/commands/](src/bot/commands/).

### Control
- `/start`, `/guide`, `/help`: greeting, setup walkthrough, full reference.
- `/pause`, `/resume`: stop / resume executing signals (`/resume` also clears a daily-limit lock).
- `/closeall`: close all open positions immediately.

### Symbols
- `/symbols`, `/symbols add <SYM>`, `/symbols add all`, `/symbols remove <SYM>`, `/symbols reset` (default list BTCUSD, XAUUSD, XAGUSD).

### Sizing and stops
- `/risk pertrade <usd>`: dollar risk per trade; sizes lots to match (0 = trading off). Required to trade.
- `/risk overrun <pct>`: how far over pertrade a trade may go when the broker's min lot forces it (default 20; 0 = strict).
- `/risk marginaware on|off`: cap order size to fit free margin (default on).
- `/minhold <secs>`: seconds to hold before the TP is armed (default 60).
- SL and TP come from the signal itself. There are no `/risk sl` or `/risk tp` commands; fixed-percentage stops were removed.

### Daily limits
- `/risk maxloss <usd>`: daily loss limit (force-close all and stop for the day).
- `/risk cap <usd>`: daily profit cap (0 = off).
- `/risk capbuffer <usd>`: trigger the cap this many dollars early.
- `/risk maxpos <n>`: max concurrent positions.

### Prop-firm and signal-quality controls
- `/risk combined <usd>`: max summed risk across same symbol and direction (0 = off).
- `/risk reentry <min>`: block reopening the same symbol and direction after a losing close (0 = off).
- `/risk minconfidence <n>`: reject feed signals below this score; channel signals bypass (0 = off).
- `/risk confidence <n>`: confidence assigned to channel signals, for reversal gating (default 69).
- `/risk btcbias on|off | bearish <n> | strongbearish <n>`: suppress crypto BUYs during BTC bearishness unless confidence clears the floor.
- `/risk stalebars <n>`: expire an unfilled feed stop/limit after N bars of its timeframe.

### Cooldowns
- `/risk losses <n>`, `/risk losswindow <min>`, `/risk cooldown <min>`: consecutive-loss cooldown parameters.
- `/cooldown`, `/cooldown reset [sym]`: list / clear cooldowns.

### Info and history
- `/status`: connection, balance, trading state, realized and floating P&L, profit-cap progress, sizing, cooldowns.
- `/settings`: all configured settings.
- `/positions`: per-position direction, symbol, lots, entry, mark, SL, TP, P&L.
- `/notifications on|off`, `/notifications signals on|off`, `/notifications signals min <0-100>`: fill and signal notifications.
- `/export [from] [to]`: export closed-trade history as a file (defaults to last 7 days).

---

## 8. Configuration

### Settings ([data/settings.json](data/settings.json), managed via Telegram)

Defined in [src/state.ts](src/state.ts). Defaults:

- `allowedSymbols`: BTCUSD, XAUUSD, XAGUSD
- `maxPositions`: 3
- `maxDailyLossUSD`: 200
- `minHoldSeconds`: 60
- `riskPerTradeUSD`: 0 (trading off until set)
- `riskOverrunPercent`: 20
- `dailyProfitCapUSD`: 0 (off)
- `capBufferUSD`: 0
- `maxConsecutiveLosses`: 3; `lossWindowMinutes`: 60; `cooldownMinutes`: 120
- `reentryCooldownMinutes`: 10
- `maxCombinedRiskUSD`: 0 (off)
- `notifyFills`: true; `signalNotify`: false; `signalNotifyMinConfidence`: 50
- `webhookConfidence`: 69; `minConfidence`: 50
- `staleOrderBars`: 3
- `marginAware`: true
- `btcBiasGate`: true; `btcBiasMinConfBearish`: 80; `btcBiasMinConfStrongBearish`: 90

The settings file also persists runtime state (active cooldowns and the daily-limit lock) so they survive a restart.

### `.env` (main process)

`CTRADER_HOST` (demo.ctraderapi.com or live.ctraderapi.com, must match the account type), `CTRADER_PORT` (5035), `CLIENT_ID`, `CLIENT_SECRET`, `ACCESS_TOKEN`, `REFRESH_TOKEN`, `ACCOUNT_ID`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS`.

Host and account type must match: a mismatch lets app auth succeed but fails account auth with CANT_ROUTE_REQUEST, crash-looping the bot. Going live needs real live credentials, not just a host change.

### `channel-listener/.env`

Telegram `API_ID` and `API_HASH`, the account `PHONE_NUMBER`, channel configuration, and the `WEBHOOK_URL` (default `http://localhost:9009/webhook`). The listener must be authenticated once interactively so `session/session.txt` exists; pm2 runs it non-interactively and cannot answer a cold login prompt.

---

## 9. Safety features

- **Per-trade risk sizing**: every trade sized to risk about `riskPerTradeUSD`; refused if unset, no SL, or no price (no unsized fallback).
- **Daily loss limit**: the gate blocks new signals once breached; a 1-second monitor ([src/risk/lossMonitor.ts](src/risk/lossMonitor.ts)) force-closes all positions on breach, requiring two consecutive breach ticks and live quotes on every open position before acting.
- **Daily profit cap**: three layers, a 1-second force-close monitor ([src/risk/capMonitor.ts](src/risk/capMonitor.ts)), a broker-side per-position cap TP, and the gate block, plus a configurable buffer to avoid overshoot.
- **Combined risk and re-entry cooldown**: per-trade-idea limits for prop-firm compliance.
- **Consecutive-loss cooldown**: pauses a symbol after too many SL hits in a window.
- **Minimum confidence and BTC-bias gates**: filter low-quality or macro-misaligned feed entries.
- **Minimum hold time**: delays the TP so positions are not closed instantly by a tight target.
- **Midnight safety close** ([src/risk/midnightClose.ts](src/risk/midnightClose.ts)): closes all positions ahead of the broker's daily reset window.
- **SL watchdog** ([src/risk/slWatchdog.ts](src/risk/slWatchdog.ts)): periodically re-checks that every open position has a broker-side stop and re-sends any that is missing.
- **Runtime persistence**: active cooldowns (both kinds) and the daily-limit lock are saved and restored across restarts, re-validated (time-based cooldowns kept only if still active; the lock kept only if set the same UTC day). Open positions and today's realized P&L are re-read from the broker on startup.
- **P&L seeding guard**: if the broker P&L seed fails at boot, daily limits are disabled for the session rather than run against a false zero.
- **Graceful error handling**: bad or unparseable signals are logged and skipped; the cTrader heartbeat keeps the push channel alive; both processes autorestart under pm2. The design is to log on everything and crash on nothing.

---

## 10. Known limitations and gaps

- **Daily loss force-close can overshoot in fast markets.** The loss monitor needs live quotes on all positions, a confirmation, and a close round-trip; in a fast move the realized loss can exceed the limit. This is the most important thing to validate before trusting the bot unattended on a funded account.
- **Reconciled positions can lose their TP.** A market fill restarted mid-min-hold before its TP was sent comes back with SL only; the signal's original TP level is not recoverable after a restart.
- **Approximations.** Account equity is reported from balance plus floating P&L; the money model assumes USD-quoted instruments (enforced by the gate, but it means non-USD pairs simply cannot be traded).
- **Single broker and account.** cTrader Open API only, one account, demo or live by host config.
- **Webhook has no authentication.** Safe only because it binds to loopback; it would be open if ever exposed.
- **No trend filter in the bot.** Signal quality depends entirely on the upstream feed and channels.
- **Single Telegram account for the listener.** Sharing the account or session across machines causes problems; a per-channel push stream can desync, mitigated by the polling fallback at the cost of some latency.
- **No automated test suite or CI** in the repository.
- **Channel trade-management messages** (CLOSE PARTIAL, MOVE SL TO ENTRY, and similar) are recognized as noise and ignored; acting on them is a possible future feature.

---

## 11. Operating notes

- pm2 runs the compiled `dist/`. After any code change, rebuild before restarting: `pnpm build && pm2 restart doochybot`. The channel listener is built separately: `cd channel-listener && pnpm build && pm2 restart channel-listener`.
- Nothing trades until `/risk pertrade` is set to a non-zero value.
- Quick start: `/risk pertrade 50`, choose symbols with `/symbols add ...`, set `/risk maxloss` and optionally `/risk cap`, then `/status` to confirm. Send `/guide` in Telegram for the full walkthrough.
</content>
</invoke>
