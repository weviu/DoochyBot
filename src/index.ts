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
import { fetchAccountInfo, fetchTodayRealizedPnL } from "./ctrader/account";
import { evaluateDailyLimits } from "./risk/dailyLoss";
import { fetchSymbols } from "./ctrader/symbols";
import { setConnection, reconcilePositions } from "./ctrader/orders";
import { setAmendConnection } from "./ctrader/amend";
import { setMidnightConnection, startMidnightCheck } from "./risk/midnightClose";
import { startDailyReset } from "./risk/dailyLoss";
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
    "/symbols - List allowed symbols\n" +
    "/symbols add <sym> - Add symbol\n" +
    "/symbols add all - Add all high-confidence symbols\n" +
    "/symbols remove <sym> - Remove symbol\n" +
    "/symbols reset - Restore default symbol list\n" +
    "/symbols <sym> <lots> - Set lot size for symbol\n" +
    "\n" +
    "/risk lotsize <lots> - Set default lot size\n" +
    "/risk sl <pct> - Set stop loss (% of entry)\n" +
    "/risk tp <pct> - Set take profit (% of entry)\n" +
    "/risk maxpos <n> - Set max open positions\n" +
    "/risk daily <pct> - Set daily loss limit (%)\n" +
    "/risk maxloss <usd> - Set max daily loss ($)\n" +
    "/risk cap <usd> - Daily profit cap; stop new trades at this profit (0 = off)\n" +
    "/risk trend <hours> - Only take signals aligned with this trend lookback (0 = off)\n" +
    "/risk losses <n> - SL hits per symbol that trigger a cooldown (0 = off)\n" +
    "/risk losswindow <min> - Window for counting SL hits\n" +
    "/risk cooldown <min> - How long a symbol stays paused after the streak\n" +
    "/cooldown - List cooled-down symbols\n" +
    "/cooldown reset [sym] - Clear a symbol's cooldown (or all)\n" +
    "/minhold <secs> - Min seconds to hold before TP is set\n" +
    "/closeall - Close all open positions\n" +
    "/export [from] [to] - Export trade history (CSV)\n" +
    "\n" +
    "/balance - Show account balance\n" +
    "/status - Connection health + bot status\n" +
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
setAmendConnection(ctrader);
setMidnightConnection(ctrader);
setExportConnection(ctrader);
setStatusConnection(ctrader);
startMidnightCheck();
startDailyReset();
console.log("[SAFETY] Midnight closer and daily reset active");
await fetchAccountInfo(ctrader);
await fetchSymbols(ctrader);
await reconcilePositions();

// Seed today's realized P&L from the broker so the daily loss/profit limits
// survive a restart. Retry once on failure. If both attempts fail, daily limits
// are disabled for this session rather than running against a false 0 baseline.
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    state.dailyRealizedPnL = await fetchTodayRealizedPnL(ctrader);
    state.dailyPnLSeeded = true;
    console.log(`[PNL] Seeded today's realized P&L: ${state.dailyRealizedPnL.toFixed(2)}`);
    evaluateDailyLimits(false);
    break;
  } catch (err: any) {
    console.warn(`[PNL] Seed attempt ${attempt} failed: ${err.errorCode || err.message || "request failed"}`);
    if (attempt === 2) {
      console.warn("[PNL] Daily loss/profit limits DISABLED this session — could not read today's P&L from broker.");
    }
  }
}
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
