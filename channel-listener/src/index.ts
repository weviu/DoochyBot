import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { TelegramClient, Api, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";

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

  // Resolve the channel entity from its username and capture its marked peer id.
  // We filter messages manually against this id rather than handing the entity to
  // NewMessage({ chats }): gramJS resolves that filter lazily and stringifies the
  // entity to "[object Object]", which it then fails to look up.
  let targetPeerId: string;
  try {
    const channel = await resolveChannel(client, config.channelUsername);
    targetPeerId = utils.getPeerId(channel);
    const title = (channel as { title?: string }).title || config.channelUsername;
    console.log(`[telegram] Listening to channel: ${title} (peer ${targetPeerId})`);
  } catch (err) {
    console.error(`[telegram] Could not resolve channel "${config.channelUsername}":`, err);
    throw err;
  }

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const chatId = event.message?.chatId?.toString();
      const text = event.message?.message ?? "";

      // The account receives updates from every chat it belongs to (MTProto has
      // no per-channel subscription), so ignore anything that isn't the target
      // channel before doing anything else — including logging.
      if (!chatId || chatId !== targetPeerId) return;

      // Log only target-channel messages, so the log reflects what we actually act on.
      console.log(`[channel] Message: ${JSON.stringify(text)}`);

      const signal = parser.processMessage(text);
      if (signal) {
        console.log("[signal] Complete signal extracted:", signal);
        await sendSignal(signal, config.webhookUrl);
      }
    } catch (err) {
      // A single bad message must never take the process down.
      console.error("[message] Error handling message (skipped):", err);
    }
  }, new NewMessage({}));

  // Liveness watchdog. The MTProto update stream can go silent while the Node
  // process stays alive and `client.connected` still reports true — pm2 then sees
  // us as "online" and never restarts, so messages are silently missed (this is
  // exactly what dropped a 7am signal). A passive `client.connected` check does
  // not catch that. Instead actively round-trip to Telegram on an interval; on
  // repeated failure force a reconnect, and if that fails exit so pm2 restarts us
  // cleanly with the saved session.
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);

  let watchdogFails = 0;
  setInterval(async () => {
    try {
      await withTimeout(client.invoke(new Api.updates.GetState()), 15_000);
      if (watchdogFails > 0) console.log("[telegram] Liveness recovered");
      watchdogFails = 0;
    } catch (err) {
      watchdogFails++;
      console.warn(`[telegram] Liveness check failed (${watchdogFails}/3): ${err instanceof Error ? err.message : err}`);
      if (watchdogFails < 3) return;
      try {
        await client.connect();
        await withTimeout(client.invoke(new Api.updates.GetState()), 15_000);
        console.log("[telegram] Reconnected — updates flowing again");
        watchdogFails = 0;
      } catch (reErr) {
        console.error(`[telegram] Connection dead, reconnect failed — exiting for pm2 restart: ${reErr instanceof Error ? reErr.message : reErr}`);
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
