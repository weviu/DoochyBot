// PM2 process definitions for DoochyBot and its Telegram channel listener.
//
// Both apps run the COMPILED output in dist/ — build before (re)starting:
//   (root)              pnpm build
//   channel-listener    cd channel-listener && npm run build
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 restart ecosystem.config.js           # both
//   pm2 restart channel-listener              # just the listener
//   pm2 logs channel-listener
//
// Note: the channel-listener must have been authenticated once interactively
// (npm run dev, enter the Telegram code) so session/session.txt exists. PM2 runs
// it non-interactively and cannot answer the login prompt on a cold session.

const path = require("path");

module.exports = {
  apps: [
    // Legacy single-user entrypoint, RETIRED at the multi-user cutover
    // (2026-07-13). The hub + doochybot pair below replaced it: same engine,
    // same .env and account, but commands and the mini-app arrive over the
    // Hub's WebSocket. Kept for emergency rollback: stop hub + doochybot,
    // uncomment this, restart.
    // {
    //   name: "doochybot-legacy",
    //   cwd: __dirname,
    //   script: path.join(__dirname, "dist", "index.js"),
    //   interpreter: "node",
    //   autorestart: true,
    //   watch: false,
    //   max_restarts: 10,
    //   restart_delay: 3000,
    //   time: true,
    //   env: {
    //     NODE_ENV: "production",
    //   },
    // },
    // Multi-user Hub: Telegram bot, mini-app, agent WebSocket endpoint.
    // Config comes from .env.hub (loaded by the process itself).
    {
      name: "hub",
      cwd: __dirname,
      script: path.join(__dirname, "dist", "hub", "index.js"),
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
    // DoochyBot: the owner's trading engine, linked to the Hub over loopback
    // WS. Same .env and cTrader account as the retired legacy entrypoint.
    // Friends run this same app on their own machines.
    {
      name: "doochybot",
      cwd: __dirname,
      script: path.join(__dirname, "dist", "doochybot", "index.js"),
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "channel-listener",
      cwd: path.join(__dirname, "channel-listener"),
      script: path.join(__dirname, "channel-listener", "dist", "index.js"),
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
