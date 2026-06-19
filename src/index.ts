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
import { statusCmd, setStatusConnection } from "./bot/commands/status";
import { cooldownCmd } from "./bot/commands/cooldown";
import { positionsCmd } from "./bot/commands/positions";
import { fetchAccountInfo, fetchTodayRealizedPnL } from "./ctrader/account";
import { evaluateDailyLimits } from "./risk/dailyLoss";
import { fetchSymbols } from "./ctrader/symbols";
import { setConnection, reconcilePositions } from "./ctrader/orders";
import { setLivePriceConnection, subscribeOpenPositions, subscribeSpots } from "./ctrader/livePrices";
import { setAmendConnection } from "./ctrader/amend";
import { setMidnightConnection, startMidnightCheck } from "./risk/midnightClose";
import { startDailyReset } from "./risk/dailyLoss";
import { startCapMonitor } from "./risk/capMonitor";
import { startLossMonitor } from "./risk/lossMonitor";
import { setNotifier } from "./bot/notify";
import { startWebhookServer } from "./webhook";

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
    await ctx.reply("DoochyBot running.\nNew here? Send /guide to set up trading, or /help for all commands.");
  });

  bot.command("guide", async (ctx) => {
    await ctx.reply(
      "HOW TO START TRADING\n" +
      "\n" +
      "1. Set your risk per trade (REQUIRED)\n" +
      "Nothing trades until this is set. It is the max $ you lose if a trade's stop is hit; the bot sizes every position to match.\n" +
      "   /risk pertrade 50\n" +
      "\n" +
      "2. Set your stop and target (sensible defaults already on)\n" +
      "SL = where the stop sits (% from entry); it also drives trade size together with pertrade. TP = where the target sits.\n" +
      "   /risk sl 0.5\n" +
      "   /risk tp 0.75\n" +
      "\n" +
      "3. Choose which symbols to trade\n" +
      "   /symbols  (show current list)\n" +
      "   /symbols add XAUUSD\n" +
      "\n" +
      "4. Set daily safety limits (recommended)\n" +
      "Each one force-closes everything and stops trading for the day when hit.\n" +
      "   /risk maxloss 200  (daily loss limit)\n" +
      "   /risk cap 300      (daily profit cap, 0 = off)\n" +
      "\n" +
      "5. Confirm it is live\n" +
      "   /resume  (only if you previously paused)\n" +
      "   /status  (Sizing should show your $ risk, not 'not set')\n" +
      "\n" +
      "Done. Signals will now execute. See /help for the full command list."
    );
  });

bot.command("help", async (ctx) => {
  await ctx.reply(
    "• CONTROL\n" +
    "/pause: stop executing signals\n" +
    "/resume: resume executing signals\n" +
    "\n" +
    "• SYMBOLS\n" +
    "/symbols: list allowed symbols\n" +
    "/symbols add <sym>: add a symbol\n" +
    "/symbols add all: add all high confidence symbols\n" +
    "/symbols remove <sym>: remove a symbol\n" +
    "/symbols reset: restore default list\n" +
    "\n" +
    "• SIZING (how big each trade is)\n" +
    "/risk pertrade <usd>: max $ you lose if a trade's stop is hit; the bot sizes the lots to match (0 = trading off)\n" +
    "\n" +
    "• STOP / TARGET\n" +
    "/risk sl <pct>: where the stop sits, as % from entry. Also drives size (with pertrade): tighter stop = bigger trade.\n" +
    "/risk tp <pct>: where the target sits, as % from entry.\n" +
    "Note: channel signals carry their own SL/TP, which override these %s.\n" +
    "/minhold <secs>: min hold before TP arms\n" +
    "\n" +
    "• DAILY LIMITS (both force close ALL positions + stop for the day)\n" +
    "/risk maxloss <usd>: daily loss limit\n" +
    "/risk cap <usd>: daily profit cap (0 = off)\n" +
    "/risk capbuffer <usd>: trigger cap this many $ early\n" +
    "/risk maxpos <n>: max concurrent positions\n" +
    "/risk combined <usd>: max summed risk across same symbol+direction positions (0 = off)\n" +
    "\n" +
    "• COOLDOWN (per symbol loss streak)\n" +
    "/risk losses <n>: SL hits before cooldown (0 = off)\n" +
    "/risk losswindow <min>: window to count hits\n" +
    "/risk cooldown <min>: pause length\n" +
    "/risk reentry <min>: after a losing close, block reopening the same symbol+direction this long (0 = off)\n" +
    "/cooldown: list cooled down symbols\n" +
    "/cooldown reset [sym]: clear a cooldown (or all)\n" +
    "\n" +
    "• POSITIONS & INFO\n" +
    "/status: connection, P&L, limits, sizing, cooldowns\n" +
    "/positions: open positions: entry, mark, SL, TP, P&L\n" +
    "/closeall: close all open positions\n" +
    "\n" +
    "/export [from] [to]: export trade history\n" +
    "\n" +
    "Notes: trade size comes from pertrade + the SL %. One position per symbol. Opposite signals flip only on higher confidence."
  );
});

  bot.command("pause", pauseCmd);
  bot.command("resume", resumeCmd);
  bot.command("symbols", symbolsCmd);
  bot.command("risk", riskCmd);
  bot.command("minhold", minholdCmd);
  bot.command("closeall", closeallCmd);
  bot.command("export", exportCmd);
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

// Pre-subscribe spot streams for every allowed symbol so a live quote is already
// flowing before the first signal arrives. Without this, the first trade on a
// symbol has no mark price and risk-based sizing can't size against it.
const allowedSymbolIds = [...new Set(
  state.settings.allowedSymbols
    .map((s) => state.symbolMap.get(s) ?? state.symbolMap.get(s.replace(/USD$/, "")))
    .filter((id): id is number => id !== undefined)
)];
await subscribeSpots(allowedSymbolIds);
console.log(`[BOOT] Pre-subscribed spots for ${allowedSymbolIds.length} allowed symbol(s)`);

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
  startWebhookServer();
  console.log("[BOOT] Ready");
}

main().catch((err) => {
  console.error("[BOOT] Fatal error:", err);
  process.exit(1);
});
