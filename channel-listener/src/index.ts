import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { TelegramClient, utils } from "telegram";
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
    const channel = await client.getEntity(config.channelUsername);
    targetPeerId = utils.getPeerId(channel);
    const title = (channel as { title?: string }).title || config.channelUsername;
    console.log(`[telegram] Listening to channel: ${title} (peer ${targetPeerId})`);
  } catch (err) {
    console.error(`[telegram] Could not resolve channel "${config.channelUsername}":`, err);
    throw err;
  }

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      // Only act on messages from the SureShot Gold channel.
      const chatId = event.message?.chatId;
      if (!chatId || chatId.toString() !== targetPeerId) return;

      const text = event.message?.message ?? "";
      console.log(`[message] ${JSON.stringify(text)}`);

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

  // Health check: if the connection drops and gramJS's own retries give up,
  // reconnect with exponential backoff. The process stays alive throughout.
  let backoff = 1000;
  const MAX_BACKOFF = 60_000;
  setInterval(async () => {
    if (client.connected) {
      backoff = 1000;
      return;
    }
    console.warn(`[telegram] Disconnected — reconnecting in ${backoff}ms`);
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
    try {
      await client.connect();
      if (client.connected) {
        console.log("[telegram] Reconnected");
        backoff = 1000;
      }
    } catch (err) {
      console.error("[telegram] Reconnect attempt failed:", err);
    }
  }, 5000).unref();

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
