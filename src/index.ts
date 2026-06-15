import dotenv from "dotenv";
import { Bot } from "grammy";
import { CTraderConnection } from "@reiryoku/ctrader-layer";
import { startPoller } from "./signals/poller";
import { state, initSettings } from "./state";
import { processSignal } from "./risk/gate";
import { pauseCmd } from "./bot/commands/pause";
import { resumeCmd } from "./bot/commands/resume";
import { symbolsCmd } from "./bot/commands/symbols";
import { riskCmd } from "./bot/commands/risk";
import { minholdCmd } from "./bot/commands/minhold";
import { closeallCmd } from "./bot/commands/closeall";
import { exportCmd, setExportConnection } from "./bot/commands/export";
import { balanceCmd, statusCmd, setStatusConnection } from "./bot/commands/status";
import { cooldownCmd } from "./bot/commands/cooldown";
import { positionsCmd } from "./bot/commands/positions";
import { fetchAccountInfo, fetchTodayRealizedPnL } from "./ctrader/account";
import { evaluateDailyLimits } from "./risk/dailyLoss";
import { fetchSymbols } from "./ctrader/symbols";
import { setConnection, reconcilePositions } from "./ctrader/orders";
import { setLivePriceConnection, subscribeOpenPositions } from "./ctrader/livePrices";
import { setAmendConnection } from "./ctrader/amend";
import { setMidnightConnection, startMidnightCheck } from "./risk/midnightClose";
import { startDailyReset } from "./risk/dailyLoss";
import { startCapMonitor } from "./risk/capMonitor";
import { startLossMonitor } from "./risk/lossMonitor";
import { setNotifier } from "./bot/notify";

dotenv.config();

const config = {
  ctrader: {
    host: process.env.CTRADER_HOST || "demo.ctraderapi.com",
    port: parseInt(process.env.CTRADER_PORT || "5035"),
    clientId: process.env.CLIENT_ID || "",
    clientSecret: process.env.CLIENT_SECRET || "",
    accessToken: process.env.ACCESS_TOKEN || "",
    refreshToken: process.env.REFRESH_TOKEN || "",
    accountId: process.env.ACCOUNT_ID || "",
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    allowedUsers: (process.env.ALLOWED_USERS || "").split(",").map(Number),
  },
};

async function connectCtrader() {
  const connection = new CTraderConnection({
    host: config.ctrader.host,
    port: config.ctrader.port,
  });

  await connection.open();
  console.log("[CTRADER] Socket opened");

  await connection.sendCommand("ProtoOAApplicationAuthReq", {
    clientId: config.ctrader.clientId,
    clientSecret: config.ctrader.clientSecret,
  });
  console.log("[CTRADER] Application authenticated");

const accountAuthRes = await connection.sendCommand("ProtoOAAccountAuthReq", {
  ctidTraderAccountId: parseInt(config.ctrader.accountId),
  accessToken: config.ctrader.accessToken,
});
console.log("[CTRADER] Account auth response:", JSON.stringify(accountAuthRes).substring(0, 200));
  console.log("[CTRADER] Account authenticated");

  connection.on("close", () => {
    console.log("[CTRADER] Connection closed");
  });

  // cTrader Open API drops the push channel (execution events stop arriving)
  // if no message is sent for ~10s. Keep it alive with a heartbeat.
  setInterval(() => {
    connection.sendHeartbeat();
  }, 10_000);
  console.log("[CTRADER] Heartbeat started (10s)");

  return connection;
}

async function startBot() {
  const bot = new Bot(config.telegram.token);
  setNotifier(bot, config.telegram.allowedUsers);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && config.telegram.allowedUsers.length > 0) {
      if (!config.telegram.allowedUsers.includes(userId)) {
        await ctx.reply("Unauthorized");
        return;
      }
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply("DoochyBot running.");
  });

bot.command("help", async (ctx) => {
  await ctx.reply(
    "/pause - Stop executing signals\n" +
    "/resume - Resume executing signals\n" +
    "\n" +
    "/symbols - List allowed symbols with lot sizes\n" +
    "/symbols add <sym> - Add symbol\n" +
    "/symbols add all - Add all high-confidence symbols\n" +
    "/symbols remove <sym> - Remove symbol\n" +
    "/symbols reset - Restore default symbol list\n" +
    "/symbols <sym> <lots> - Set per-symbol lot size\n" +
    "\n" +
    "/risk lotsize <lots> - Default lot size (fixed sizing)\n" +
    "/risk risk <usd> - Risk $ per trade: size derived from SL%, bounds each trade's loss (0 = fixed lots)\n" +
    "/risk sl <pct> - Stop loss (% of entry)\n" +
    "/risk tp <pct> - Take profit (% of entry)\n" +
    "/risk maxpos <n> - Max open positions\n" +
    "/risk daily <pct> - Daily loss limit (%)\n" +
    "/risk maxloss <usd> - Max daily loss ($)\n" +
    "/risk cap <usd> - Daily profit cap: force-close all & block signals at this profit (0 = off)\n" +
    "/risk capbuffer <usd> - Close cap_usd - buffer$ early so realized never overshoots cap\n" +
    "/risk losses <n> - SL hits per symbol before cooldown (0 = off)\n" +
    "/risk losswindow <min> - Window for counting SL hits\n" +
    "/risk cooldown <min> - How long a symbol is paused after the streak\n" +
    "\n" +
    "/cooldown - List cooled-down symbols\n" +
    "/cooldown reset [sym] - Clear a symbol's cooldown (or all)\n" +
    "/minhold <secs> - Min hold time before TP is set\n" +
    "\n" +
    "/positions - Open positions: entry, mark, SL, TP, P&L\n" +
    "/closeall - Close all open positions\n" +
    "/export [from] [to] - Export trade history\n" +
    "\n" +
    "/balance - Account balance\n" +
    "/status - Connection health, P&L, cap, cooldowns\n" +
    "\n" +
    "One position per symbol. Opposite signals only flip if confidence is higher."
  );
});

  bot.command("pause", pauseCmd);
  bot.command("resume", resumeCmd);
  bot.command("symbols", symbolsCmd);
  bot.command("risk", riskCmd);
  bot.command("minhold", minholdCmd);
  bot.command("closeall", closeallCmd);
  bot.command("export", exportCmd);
  bot.command("balance", balanceCmd);
  bot.command("status", statusCmd);
  bot.command("cooldown", cooldownCmd);
  bot.command("positions", positionsCmd);
  bot.start({
    drop_pending_updates: true,
    onStart: () => console.log("[TELEGRAM] Bot started"),
  });
}

async function main() {
  console.log("[BOOT] Starting DoochyBot...");
  initSettings();
const ctrader = await connectCtrader();
setConnection(ctrader);
setLivePriceConnection(ctrader);
setAmendConnection(ctrader);
setMidnightConnection(ctrader);
setExportConnection(ctrader);
setStatusConnection(ctrader);
startMidnightCheck();
startDailyReset();
startCapMonitor();
startLossMonitor();
console.log("[SAFETY] Midnight closer, daily reset, and loss monitor active");
await fetchAccountInfo(ctrader);
await fetchSymbols(ctrader);

// Seed today's realized P&L from the broker BEFORE reconciling positions. This
// order is critical: reconcilePositions() re-arms TPs on positions opened before
// the restart, and the cap-TP logic in amend.ts only applies when dailyPnLSeeded
// is true. Seeding first means re-armed TPs are correctly capped to the remaining
// headroom instead of a full normal TP that could blow past the cap. Retry once;
// if both attempts fail, daily limits are disabled rather than run against a false 0.
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    state.dailyRealizedPnL = await fetchTodayRealizedPnL(ctrader);
    state.dailyPnLSeeded = true;
    console.log(`[PNL] Seeded today's realized P&L: ${state.dailyRealizedPnL.toFixed(2)}`);
    break;
  } catch (err: any) {
    console.warn(`[PNL] Seed attempt ${attempt} failed: ${err.errorCode || err.message || "request failed"}`);
    if (attempt === 2) {
      console.warn("[PNL] Daily loss/profit limits DISABLED this session — could not read today's P&L from broker.");
    }
  }
}

await reconcilePositions();
// Start streaming live prices for any position we already hold so floating P&L
// and the profit cap are accurate immediately, not just after the next signal.
await subscribeOpenPositions();
evaluateDailyLimits(false);
await startBot();
    startPoller((signal) => {
    processSignal(signal);
  });
  console.log("[BOOT] Ready");
}

main().catch((err) => {
  console.error("[BOOT] Fatal error:", err);
  process.exit(1);
});
