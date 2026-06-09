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
import { fetchAccountInfo } from "./ctrader/account";
import { fetchSymbols } from "./ctrader/symbols";
import { setConnection } from "./ctrader/orders";
import { setAmendConnection } from "./ctrader/amend";

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
    "/symbols <sym> <lots> - Set lot size for symbol\n" +
    "\n" +
    "/risk lotsize <lots> - Set default lot size\n" +
    "/risk sl <pct> - Set stop loss (% of entry)\n" +
    "/risk tp <pct> - Set take profit (% of entry)\n" +
    "/risk maxpos <n> - Set max open positions\n" +
    "/risk daily <pct> - Set daily loss limit (%)\n" +
    "/risk maxloss <usd> - Set max daily loss ($)\n" +
    "/minhold <secs> - Min seconds to hold before TP is set"
  );
});

  bot.command("pause", pauseCmd);
  bot.command("resume", resumeCmd);
  bot.command("symbols", symbolsCmd);
  bot.command("risk", riskCmd);
  bot.command("minhold", minholdCmd);
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
await fetchAccountInfo(ctrader);
await fetchSymbols(ctrader);
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
