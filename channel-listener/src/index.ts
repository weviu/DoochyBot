import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { TelegramClient, Api, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent, Raw } from "telegram/events";

import { SignalParser } from "./parser";
import { sendSignal } from "./webhook";

/**
 * Minimal .env loader — keeps `telegram` (gramJS) as the only runtime dependency.
 * Reads KEY=VALUE lines into process.env without overriding anything already set.
 */
function loadEnv(): void {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const SESSION_DIR = path.join(__dirname, "..", "session");
const SESSION_FILE = path.join(SESSION_DIR, "session.txt");

interface Config {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  channelUsername: string;
  webhookUrl: string;
}

function loadConfig(): Config {
  const apiId = parseInt(process.env.API_ID || "", 10);
  const apiHash = process.env.API_HASH || "";
  const phoneNumber = process.env.PHONE_NUMBER || "";
  const channelUsername = process.env.CHANNEL_USERNAME || "";
  const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:9009/webhook";

  const missing: string[] = [];
  if (!apiId) missing.push("API_ID");
  if (!apiHash) missing.push("API_HASH");
  if (!phoneNumber) missing.push("PHONE_NUMBER");
  if (!channelUsername) missing.push("CHANNEL_USERNAME");
  if (missing.length) {
    throw new Error(`Missing required .env values: ${missing.join(", ")}`);
  }

  return { apiId, apiHash, phoneNumber, channelUsername, webhookUrl };
}

function loadSession(): StringSession {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const saved = fs.readFileSync(SESSION_FILE, "utf8").trim();
      if (saved) {
        console.log("[session] Loaded saved session");
        return new StringSession(saved);
      }
    }
  } catch (err) {
    console.warn("[session] Could not read saved session, starting fresh:", err);
  }
  return new StringSession("");
}

function saveSession(session: StringSession): void {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, session.save(), "utf8");
    console.log("[session] Session saved");
  } catch (err) {
    console.error("[session] Failed to save session:", err);
  }
}

/** Prompt the user on the terminal (used for the login verification code). */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

/**
 * Resolve the configured channel into an entity, accepting either form:
 *   - public username:  "sureshotgold", "@sureshotgold", "t.me/sureshotgold"
 *   - private invite:   "https://t.me/+2bCJ...", "t.me/+2bCJ...", "+2bCJ..."
 *
 * Private channels (created from an invite link) have no username, so getEntity
 * can't find them. We resolve those via the invite hash with CheckChatInvite,
 * which returns the chat directly because the account is already a member.
 */
async function resolveChannel(client: TelegramClient, raw: string): Promise<Api.TypeEntityLike> {
  // Strip any t.me/ URL wrapper so we're left with "username", "+hash" or "joinchat/hash".
  let id = raw.trim().replace(/^https?:\/\//i, "").replace(/^t\.me\//i, "");

  const inviteHash =
    id.startsWith("+") ? id.slice(1)
    : /^joinchat\//i.test(id) ? id.replace(/^joinchat\//i, "")
    : null;

  if (inviteHash) {
    const res = await client.invoke(new Api.messages.CheckChatInvite({ hash: inviteHash }));
    // Already a member → the chat is included directly.
    if (res instanceof Api.ChatInviteAlready || res instanceof Api.ChatInvitePeek) {
      return res.chat;
    }
    throw new Error(
      `The account is not a member of the private channel for invite +${inviteHash}. ` +
      `Join it in Telegram first, then restart.`
    );
  }

  // Public username (drop a leading @).
  return client.getEntity(id.replace(/^@/, ""));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const parser = new SignalParser();
  const session = loadSession();

  // gramJS handles low-level reconnects itself; the outer backoff loop below
  // covers the case where the connection is lost entirely.
  const client = new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
    retryDelay: 2000,
  });

  console.log("[telegram] Connecting...");

  // On first run this prompts for the login code (sent to the Telegram account)
  // and, if set, a 2FA password. On later runs the saved session skips all of it.
  await client.start({
    phoneNumber: async () => config.phoneNumber,
    phoneCode: async () => prompt("Enter the Telegram code you received: "),
    password: async () => prompt("Enter your 2FA password (leave blank if none): "),
    onError: (err) => console.error("[telegram] Auth error:", err),
  });

  saveSession(session);
  console.log("[telegram] Connected and authenticated");

  // Resolve the channel once. We keep both the entity (for direct polling) and
  // its marked peer id (to match incoming push updates). We match messages
  // manually rather than via NewMessage({ chats }), which gramJS resolves lazily
  // and mishandles (it stringifies the entity to "[object Object]").
  let channel: Api.TypeEntityLike;
  let targetPeerId: string;
  try {
    channel = await resolveChannel(client, config.channelUsername);
    targetPeerId = utils.getPeerId(channel);
    const title = (channel as { title?: string }).title || config.channelUsername;
    console.log(`[telegram] Listening to channel: ${title} (peer ${targetPeerId})`);
  } catch (err) {
    console.error(`[telegram] Could not resolve channel "${config.channelUsername}":`, err);
    throw err;
  }

  // Messages reach us two ways, both feeding this one handler (deduped by message
  // id so nothing is processed twice):
  //  - push updates: instant, but a single channel's push stream can silently
  //    desync and stop while the rest of the account keeps flowing.
  //  - polling: slower but reliable; the safety net for the above.
  const seen = new Set<number>();
  const handleMessage = async (id: number, text: string, source: string): Promise<void> => {
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    console.log(`[channel] Message (${source}, id ${id}): ${JSON.stringify(text)}`);
    const signal = parser.processMessage(text);
    if (signal) {
      console.log("[signal] Complete signal extracted:", signal);
      await sendSignal(signal, config.webhookUrl);
    }
  };

  // Push path: instant delivery while the channel's update stream is healthy.
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const chatId = event.message?.chatId?.toString();
      if (!chatId || chatId !== targetPeerId) return;
      await handleMessage(event.message!.id, event.message!.message ?? "", "push");
    } catch (err) {
      // A single bad message must never take the process down.
      console.error("[message] Error handling push message (skipped):", err);
    }
  }, new NewMessage({}));

  // Poll path: the reliable safety net. Seed with the current latest ids so we do
  // not replay history, then every 15s fetch recent messages and process any new
  // ones. This catches signals the push stream misses when the channel's update
  // sequence desyncs (observed: account updates flowing but this channel went
  // silent). Reading also nudges gramJS to resync the channel.
  try {
    const seed = await client.getMessages(channel, { limit: 25 });
    for (const m of seed) seen.add(m.id);
    console.log(`[poll] Seeded ${seed.length} recent message id(s); polling every 15s`);
  } catch (err) {
    console.warn(`[poll] Seed failed (will still poll): ${err instanceof Error ? err.message : err}`);
  }

  setInterval(async () => {
    try {
      const msgs = await client.getMessages(channel, { limit: 25 });
      const fresh = msgs.filter((m) => !seen.has(m.id)).sort((a, b) => a.id - b.id);
      for (const m of fresh) {
        console.log(`[poll] Found a message the push stream missed (id ${m.id})`);
        await handleMessage(m.id, m.message ?? "", "poll");
      }
      // Bound the dedupe set: keep only the most recent ids.
      if (seen.size > 1000) {
        const top = [...seen].sort((a, b) => b - a).slice(0, 500);
        seen.clear();
        for (const id of top) seen.add(id);
      }
    } catch (err) {
      console.warn(`[poll] Fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }, 15_000);

  // VALIDATION INSTRUMENTATION (diagnosing missed signals after a gramJS
  // reconnect). Count EVERY raw update the client receives, regardless of chat.
  // The hypothesis is that after a socket reconnect the update stream stops
  // delivering updates to our handlers while the request channel (GetState)
  // keeps answering. If so, after a reconnect we should see GetState succeed and
  // its pts advance while this raw-update count stays at 0.
  let rawUpdatesSinceTick = 0;
  let lastUpdateAt = Date.now();
  client.addEventHandler(() => {
    rawUpdatesSinceTick++;
    lastUpdateAt = Date.now();
  }, new Raw({}));

  // Liveness watchdog. The MTProto update stream can go silent while the Node
  // process stays alive and `client.connected` still reports true, so pm2 sees
  // us as "online" and never restarts and messages are silently missed. A passive
  // `client.connected` check does not catch that, so actively round-trip to
  // Telegram on an interval; on repeated failure force a reconnect, and if that
  // fails exit so pm2 restarts us cleanly with the saved session.
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);

  let watchdogFails = 0;
  setInterval(async () => {
    try {
      const st: any = await withTimeout(client.invoke(new Api.updates.GetState()), 15_000);
      // Validation line: pairs the server update counter (pts) with how many
      // updates we actually received. pts climbing while updates stay 0 over
      // several ticks is the dead-update-stream signature.
      const sinceUpdate = Math.round((Date.now() - lastUpdateAt) / 1000);
      console.log(`[telegram] Liveness OK: GetState pts=${st?.pts} qts=${st?.qts}, raw updates last 60s=${rawUpdatesSinceTick}, last update ${sinceUpdate}s ago`);
      rawUpdatesSinceTick = 0;
      if (watchdogFails > 0) console.log("[telegram] Liveness recovered");
      watchdogFails = 0;
    } catch (err) {
      watchdogFails++;
      console.warn(`[telegram] Liveness check failed (${watchdogFails}/3): ${err instanceof Error ? err.message : err}`);
      if (watchdogFails < 3) return;
      try {
        await client.connect();
        await withTimeout(client.invoke(new Api.updates.GetState()), 15_000);
        console.log("[telegram] Reconnected, updates flowing again");
        watchdogFails = 0;
      } catch (reErr) {
        console.error(`[telegram] Connection dead, reconnect failed, exiting for pm2 restart: ${reErr instanceof Error ? reErr.message : reErr}`);
        process.exit(1);
      }
    }
  }, 60_000);

  console.log("[telegram] Listener is running");
}

// Crash on nothing: log unexpected errors and keep going.
process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught exception (kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled rejection (kept alive):", reason);
});

main().catch((err) => {
  // Startup failed (bad config / auth / channel). Log clearly and exit so a
  // process manager can restart us; runtime errors are handled above.
  console.error("[fatal] Startup failed:", err);
  process.exit(1);
});
