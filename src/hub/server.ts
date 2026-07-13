import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { Registry, REQUEST_TIMEOUT_MS } from "./registry";
import { requireAuth } from "./auth";
import { getUsers, setUserSettings } from "./db";
import { AgentMsg } from "./protocol";

// The Hub's HTTP + WebSocket surface, mirroring the routes the single-user bot
// exposes today (so the tunnel, channel-listener, and mini-app need no URL
// changes at cutover):
//   /app      static mini-app SPA
//   /api/*    per-user relays to the requesting user's agent
//   /webhook  channel-listener signals, forwarded to the owner's agent
//   /ws       agent WebSocket endpoint

// Same light shape check the bot's webhook applies, so garbage still gets a 400
// here instead of a round-trip to the agent. Full parsing (and the confidence
// default, which is an agent-side setting) stays in the agent.
const SIGNAL_SHAPE = /^(BUY|SELL)\s+\S+\s+(?:LIMIT=[\d.]+\s+)?SL=[\d.]+\s+TP=[\d.]+/i;

// Kill sockets that miss two ping rounds. Friends' PCs sleep without closing
// TCP cleanly; without this the registry would keep routing to a black hole
// until the OS finally times the connection out.
const WS_PING_INTERVAL_MS = 30_000;

function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function webappDist(): string {
  // dist/hub/server.js at runtime, src/hub/server.ts under tsx: repo root is
  // three levels up either way.
  return path.resolve(__dirname, "..", "..", "webapp", "dist");
}

// Relay one mini-app API call to the calling user's agent and translate the
// outcome to HTTP: 503 when the agent is offline or silent, 502 when the agent
// answered with an error, agent JSON otherwise.
async function relayApi(
  registry: Registry,
  userId: number,
  endpoint: string,
  params: Record<string, any>,
  res: express.Response
): Promise<void> {
  const socket = registry.socketFor(userId);
  if (!socket) {
    res.status(503).json({ error: "agent offline" });
    return;
  }
  try {
    const reply = await registry.request(socket, { type: "api", endpoint, params });
    if (!reply.ok) {
      res.status(502).json({ error: reply.error || "agent error" });
      return;
    }
    res.json(reply.data ?? {});
  } catch {
    res.status(503).json({ error: "agent offline or not responding" });
  }
}

export function startHubServer(registry: Registry, port: number): http.Server {
  const app = express();

  // ---- /api: per-user relays ------------------------------------------------
  const api = express.Router();
  api.use(express.json());
  api.use(requireAuth);

  // The user's last-known settings live in users.json and could be served even
  // with the agent offline, but every live route goes through the agent.
  api.get("/status", (req: any, res) => relayApi(registry, req.telegramUserId, "status", {}, res));
  api.get("/positions", (req: any, res) => relayApi(registry, req.telegramUserId, "positions", {}, res));
  api.post("/pause", (req: any, res) => relayApi(registry, req.telegramUserId, "pause", {}, res));
  api.post("/resume", (req: any, res) => relayApi(registry, req.telegramUserId, "resume", {}, res));
  api.post("/closeall", (req: any, res) => relayApi(registry, req.telegramUserId, "closeall", {}, res));
  app.use("/api", api);

  // ---- /app: static mini-app (unchanged from the single-user server) ---------
  const dist = webappDist();
  if (fs.existsSync(dist)) {
    app.use("/app", express.static(dist));
    app.get("/app/{*splat}", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
    console.log(`[HUB] Serving mini-app UI from ${dist} at /app`);
  } else {
    console.warn(`[HUB] Mini-app build not found at ${dist}; /app will 404`);
  }

  // ---- /webhook: channel-listener signals, forwarded to the owner's agent ----
  const webhookSecret = process.env.WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    console.warn("[HUB] No WEBHOOK_SECRET set; /webhook is unauthenticated");
  }

  app.post("/webhook", express.text({ type: "*/*" }), async (req, res) => {
    if (webhookSecret && !secretEquals(req.get("X-Webhook-Secret") || "", webhookSecret)) {
      console.log("[HUB] /webhook rejected: missing/invalid secret");
      return res.status(401).send("Unauthorized");
    }
    const body = typeof req.body === "string" ? req.body.trim() : "";
    const source = (req.get("X-Signal-Source") || "Channel").trim() || "Channel";
    console.log(`[HUB] Signal received (${source}): ${JSON.stringify(body)}`);

    if (!SIGNAL_SHAPE.test(body)) {
      return res.status(400).send("Could not parse signal");
    }

    // Fan the signal out to EVERY connected agent; each user's own risk gate,
    // symbol list, and pause state decide what to do with it. Users never run
    // the channel-listener themselves: this hub-side broadcast is how channel
    // signals reach them.
    const users = getUsers();
    const targets = registry.connectedUserIds()
      .map((userId) => ({ userId, socket: registry.socketFor(userId)! }))
      .filter((t) => t.socket);
    if (targets.length === 0) {
      console.warn("[HUB] No agents online; signal dropped");
      return res.status(503).send("No agents online");
    }

    const results = await Promise.all(targets.map(async ({ userId, socket }) => {
      const name = users[String(userId)]?.name || String(userId);
      try {
        const reply = await registry.request(socket, { type: "signal", text: body, source }, REQUEST_TIMEOUT_MS);
        return `${name}: ${reply.data?.text || (reply.ok ? "accepted" : `rejected: ${reply.error || "unknown"}`)}`;
      } catch {
        return `${name}: agent not responding`;
      }
    }));

    console.log(`[HUB] Signal fanned out to ${targets.length} agent(s)`);
    // 200 regardless of individual outcomes, same contract as the old
    // endpoint; the body carries the per-user results for the listener's log.
    return res.status(200).send(results.join("\n"));
  });

  // Everything else is a flat 404, same explicit surface as the old server.
  app.use((_req, res) => {
    res.status(404).send("Not found");
  });

  // ---- HTTP + WebSocket on one port ------------------------------------------
  // Loopback only, exactly like the old server: agents on other machines reach
  // /ws through the Cloudflare tunnel; Agent-San connects to loopback directly.
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));

    socket.on("message", (raw) => {
      let msg: AgentMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
        return;
      }
      const reply = registry.handleMessage(socket, msg);
      if (reply) socket.send(JSON.stringify(reply));
    });

    socket.on("close", () => registry.release(socket));
    socket.on("error", () => socket.close());
  });

  const pinger = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate(); // close event fires and releases the binding
        continue;
      }
      alive.set(socket, false);
      try { socket.ping(); } catch { /* terminated below on next round */ }
    }
  }, WS_PING_INTERVAL_MS);
  wss.on("close", () => clearInterval(pinger));

  server.listen(port, "127.0.0.1", () => {
    console.log(`[HUB] Listening on http://127.0.0.1:${port} (/app, /api, /webhook, /ws)`);
  });

  return server;
}

// Persist a settings snapshot an agent included in a cmd response, as the
// last-known copy for offline mini-app display. Exposed here so bot.ts stays
// free of db imports it does not otherwise need.
export function persistSettingsSnapshot(userId: number, settings: unknown): void {
  if (settings && typeof settings === "object") {
    setUserSettings(userId, settings as Record<string, any>);
  }
}
