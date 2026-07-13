# DoochyBot: local agent setup

DoochyBot trades your own cTrader account from your own machine. Telegram
commands and the mini-app talk to a central hub; the hub relays them to the
DoochyBot running on your PC.

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Your own cTrader account (demo or funded)
- Your Telegram account whitelisted by the hub owner (they run /adduser)

## Get your cTrader API credentials (5 minutes, once)

1. Go to https://openapi.ctrader.com/apps and press "Add new app" (any name).
   Wait until it shows as Active.
2. Press "Credentials" next to your app: copy the Client ID and Client Secret.
3. On the same page, generate tokens for your cTrader ID and approve access to
   your trading account: copy the Access token and Refresh token.

Those four values are everything the setup wizard asks for; it finds your
trading account automatically from them.

## Install and set up

```
git clone <repo url>   # or unzip the archive you were given
cd doochybot
pnpm install
pnpm doochybot:setup
```

The wizard asks for the four credential values, looks up your trading account,
writes .env, builds, and offers to start. On the first start it asks for a
pairing code: send /pair to @DoochyBot in Telegram and type the 6-character
code at the prompt. You should see "Paired as user ..." and a confirmation in
Telegram that your agent is online.

After that, starting is always just:

```
pnpm doochybot:start
```

(Prefer flags? `pnpm doochybot:start -- --code YOURCODE` or AGENT_PAIR_CODE in
.env also work for the one-time pairing. To reconfigure credentials, delete
.env and re-run pnpm doochybot:setup.)

## Use it

Everything happens in Telegram via @DoochyBot: /status, /positions, /risk,
/pause, /resume, /closeall, /help for the full list. Set your risk before
anything trades:

```
/risk pertrade 25
```

## Where signals come from

You do not set up anything for signals. Your DoochyBot polls the scanner feed
itself, and channel signals are delivered to it automatically by the hub while
it is connected. (The repo also contains the hub and channel-listener code;
those run only on the central server, never on your machine.)

## Keep it running

Your DoochyBot only trades while your machine is on and the process is
running. If the PC sleeps, nothing manages new signals until it wakes (open
positions keep their broker-side SL/TP). To run it under pm2 so it survives
reboots:

```
npm install -g pm2
pm2 start ecosystem.user.config.js
pm2 save && pm2 startup
```

## Troubleshooting

- "Your agent is offline" in Telegram: the process is not running or has no
  internet; start it and retry.
- "Saved token rejected": you were re-paired or removed; get a fresh code with
  /pair and start with --code again.
- CANT_ROUTE_REQUEST at startup: wrong CTRADER_HOST for your account type
  (demo vs live).
