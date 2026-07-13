import { state } from "../state";
import { processSignal } from "../risk/gate";
import { parseTextSignal } from "../webhook";
import { pauseCmd } from "../bot/commands/pause";
import { resumeCmd } from "../bot/commands/resume";
import { symbolsCmd } from "../bot/commands/symbols";
import { riskCmd } from "../bot/commands/risk";
import { minholdCmd } from "../bot/commands/minhold";
import { closeallCmd } from "../bot/commands/closeall";
import { exportCmd } from "../bot/commands/export";
import { statusCmd, getStatusData } from "../bot/commands/status";
import { settingsCmd } from "../bot/commands/settings";
import { notificationsCmd } from "../bot/commands/notifications";
import { cooldownCmd } from "../bot/commands/cooldown";
import { positionsCmd, getPositionsData } from "../bot/commands/positions";
import { orderCmd } from "../bot/commands/order";
import { getConnection, pauseTrading, resumeTrading, closeAll } from "../miniapp/service";
import { HubRequest } from "./hubClient";

// Translate Hub requests into the existing single-user handlers. The grammY
// handlers only ever use ctx.message.text, ctx.reply, and (export only)
// ctx.replyWithDocument, so a synthetic ctx that collects replies lets them run
// unchanged over the WS relay.

type Handler = (ctx: any) => Promise<void> | void;

const COMMANDS: Record<string, Handler> = {
  pause: pauseCmd,
  resume: resumeCmd,
  symbols: symbolsCmd,
  risk: riskCmd,
  minhold: minholdCmd,
  closeall: closeallCmd,
  export: exportCmd,
  status: statusCmd,
  settings: settingsCmd,
  notifications: notificationsCmd,
  cooldown: cooldownCmd,
  positions: positionsCmd,
  order: orderCmd,
};

// Same text the legacy /guide serves (src/index.ts). Duplicated deliberately:
// the legacy entrypoint must stay byte-for-byte untouched until cutover, after
// which it is deleted and this copy becomes the only one.
const GUIDE_TEXT =
  "HOW TO START TRADING\n" +
  "\n" +
  "1. Set your risk per trade (REQUIRED)\n" +
  "Nothing trades until this is set. It is the max $ you lose if a trade's stop is hit; the bot sizes every position to match.\n" +
  "   /risk pertrade 50\n" +
  "\n" +
  "2. Nothing to set for SL/TP\n" +
  "Each signal carries its own stop and target; the bot sizes the trade to that stop so a hit loses ~your pertrade amount. A signal with no SL/TP is skipped.\n" +
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
  "Done. Signals will now execute. See /help for the full command list.";

// Run one relayed command through its existing handler, collecting every
// ctx.reply into the response text. The full settings snapshot rides along on
// every response so the Hub's last-known copy (users.json) stays fresh without
// the Hub knowing which commands mutate settings.
async function runCommand(cmd: string, args: string[]): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (cmd === "guide") {
    return { ok: true, data: { text: GUIDE_TEXT, settings: { ...state.settings } } };
  }

  const handler = COMMANDS[cmd];
  if (!handler) return { ok: false, error: `unknown command: ${cmd}` };

  // Manual orders arrive as the raw message ("SELL XAUUSD 0.02 ..."); slash
  // commands are reassembled the way grammY would have delivered them.
  const text = cmd === "order" ? args.join(" ") : `/${cmd} ${args.join(" ")}`.trim();

  const replies: string[] = [];
  const ctx = {
    message: { text },
    reply: async (t: string) => { replies.push(t); },
    replyWithDocument: async () => {
      replies.push("(file download is not available through the Hub yet)");
    },
  };

  await handler(ctx);
  return {
    ok: true,
    data: {
      text: replies.join("\n\n") || "OK",
      settings: { ...state.settings },
    },
  };
}

// The mini-app API surface, same endpoints the old in-process /api served.
async function runApi(endpoint: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  switch (endpoint) {
    case "status":
      return { ok: true, data: await getStatusData(getConnection()) };
    case "positions":
      return { ok: true, data: getPositionsData() };
    case "settings":
      // The full settings object, for the mini-app's control panel to pre-fill
      // its forms. The text /settings command isn't machine-readable; this is.
      return { ok: true, data: { ...state.settings } };
    case "pause":
      pauseTrading();
      return { ok: true, data: { paused: true } };
    case "resume": {
      const { wasLocked } = resumeTrading();
      return { ok: true, data: { paused: false, lockCleared: wasLocked } };
    }
    case "closeall":
      return { ok: true, data: await closeAll() };
    default:
      return { ok: false, error: `unknown endpoint: ${endpoint}` };
  }
}

// Channel signal, forwarded raw by the Hub. Parsed here (not in the Hub)
// because the confidence default is this agent's own setting.
function runSignal(text: string, source: string): { ok: boolean; data?: any; error?: string } {
  const signal = parseTextSignal(text, source);
  if (!signal) return { ok: false, error: "could not parse signal" };
  const result = processSignal(signal);
  return {
    ok: true,
    data: {
      text: result.accepted
        ? `Signal accepted: ${signal.direction} ${signal.symbol} executing`
        : `Signal rejected: ${result.reason ?? "unknown reason"}`,
    },
  };
}

export async function handleHubRequest(msg: HubRequest): Promise<{ ok: boolean; data?: any; error?: string }> {
  switch (msg.type) {
    case "cmd":
      return runCommand(String(msg.cmd || ""), msg.args || []);
    case "api":
      return runApi(String(msg.endpoint || ""));
    case "signal":
      return runSignal(String(msg.text || ""), String(msg.source || "Channel"));
    default:
      return { ok: false, error: `unknown request type: ${(msg as any).type}` };
  }
}
