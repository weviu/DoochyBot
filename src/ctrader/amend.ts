import { randomUUID } from "crypto";
import { state } from "../state";

let connection: any = null;

export function setAmendConnection(conn: any): void {
  connection = conn;
}

// Number of decimal places in a price (used to round SL/TP to a valid tick).
function priceDigits(price: number): number {
  const s = String(price);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

// ProtoOAAmendPositionSLTPReq has no dedicated Res — success arrives as a
// ProtoOAExecutionEvent (ORDER_REPLACED) and failure as a ProtoOAOrderErrorEvent.
// sendCommand resolves immediately without confirming, so we listen for the
// real outcome here and log it.
async function sendAmend(positionId: number, fields: Record<string, any>, desc: string): Promise<void> {
  const pidStr = String(positionId);
  // The error event carries positionId="0" but DOES echo the request's
  // clientMsgId, so correlate rejections by msgId to avoid cross-talk between
  // concurrent amends on different positions.
  const msgId = randomUUID();

  const outcome = new Promise<void>((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      connection.removeEventListener(execId);
      connection.removeEventListener(errId);
    };
    const timer = setTimeout(() => {
      cleanup();
      console.log(`[AMEND] ${desc}: no confirmation within 5s | Position #${positionId}`);
      resolve();
    }, 5_000);

    let execId: string;
    execId = connection.on("ProtoOAExecutionEvent", (event: any) => {
      const data = event.descriptor ?? event;
      if (String(data.position?.positionId) !== pidStr) return;
      if (data.executionType === "ORDER_REPLACED") {
        cleanup();
        console.log(`[AMEND] ${desc}: confirmed | Position #${positionId}`);
        resolve();
      }
    });

    let errId: string;
    errId = connection.on("ProtoOAOrderErrorEvent", (event: any) => {
      const data = event.descriptor ?? event;
      if (data.clientMsgId !== msgId) return;
      cleanup();
      console.log(`[AMEND] ${desc}: REJECTED ${data.errorCode} — ${data.description} | Position #${positionId}`);
      resolve();
    });
  });

  await connection.sendCommand("ProtoOAAmendPositionSLTPReq", {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID || "0"),
    positionId,
    ...fields,
  }, msgId);
  await outcome;
}

export async function amendPositionSLTP(
  positionId: number,
  symbol: string,
  entryPrice: number,
  direction: "BUY" | "SELL",
  signal: { sl?: number; tp?: number }
): Promise<void> {
  if (!connection) {
    console.log("[AMEND] No cTrader connection");
    return;
  }

  // Percentage-of-entry SL/TP. Works uniformly across BTC/ETH/XAU/FX without
  // any contract-size math. Explicit signal values (if ever provided) win.
  const slPct = state.settings.stopLossPercent;
  const tpPct = state.settings.takeProfitPercent;
  let sl: number | null = signal.sl ?? null;
  let tp: number | null = signal.tp ?? null;

  if (sl === null && slPct > 0) {
    sl = direction === "BUY" ? entryPrice * (1 - slPct / 100) : entryPrice * (1 + slPct / 100);
  }
  if (tp === null && tpPct > 0) {
    tp = direction === "BUY" ? entryPrice * (1 + tpPct / 100) : entryPrice * (1 - tpPct / 100);
  }

  if (sl && direction === "BUY" && sl >= entryPrice) {
    console.log(`[AMEND] Invalid SL for BUY: ${sl} >= entry ${entryPrice}. Skipping SL.`);
    sl = null;
  }
  if (sl && direction === "SELL" && sl <= entryPrice) {
    console.log(`[AMEND] Invalid SL for SELL: ${sl} <= entry ${entryPrice}. Skipping SL.`);
    sl = null;
  }
  if (tp && direction === "BUY" && tp <= entryPrice) {
    console.log(`[AMEND] Invalid TP for BUY: ${tp} <= entry ${entryPrice}. Skipping TP.`);
    tp = null;
  }
  if (tp && direction === "SELL" && tp >= entryPrice) {
    console.log(`[AMEND] Invalid TP for SELL: ${tp} >= entry ${entryPrice}. Skipping TP.`);
    tp = null;
  }

  // Round SL/TP to the entry price's precision. Computing distances introduces
  // float junk (e.g. 4333.099999999999) which the broker silently rejects.
  const digits = priceDigits(entryPrice);
  if (sl) sl = round(sl, digits);
  if (tp) tp = round(tp, digits);

  const delayMs = (state.settings.minHoldSeconds ?? 60) * 1000;

  // With no min-hold delay, set SL and TP in a SINGLE amend. cTrader's amend
  // replaces the full SL/TP state anyway, so one call is cleaner and avoids a
  // redundant SL-only amend that the broker doesn't always confirm in time.
  if (delayMs === 0) {
    const fields: Record<string, any> = {};
    if (sl) fields.stopLoss = sl;
    if (tp) fields.takeProfit = tp;
    if (Object.keys(fields).length) {
      await sendAmend(positionId, fields, `SL ${sl ?? "—"} / TP ${tp ?? "—"}`);
      const pos = state.positions.get(positionId);
      if (pos) { if (sl) pos.sl = sl; if (tp) pos.tp = tp; }
    }
    return;
  }

  // Otherwise: set SL immediately, then TP after the min-hold delay.
  if (sl) {
    await sendAmend(positionId, { stopLoss: sl }, `SL ${sl}`);
    const pos = state.positions.get(positionId);
    if (pos) pos.sl = sl;
  }

  if (tp) {
    console.log(`[AMEND] TP will be set in ${delayMs / 1000}s (min hold) | Position #${positionId}`);

    setTimeout(async () => {
      if (!state.positions.has(positionId)) {
        console.log(`[AMEND] TP skipped - position #${positionId} already closed`);
        return;
      }

      // cTrader's amend REPLACES the full SL/TP state. Must re-send the
      // existing SL or it gets wiped when we set the TP.
      const fields: Record<string, any> = { takeProfit: tp };
      if (sl) fields.stopLoss = sl;
      await sendAmend(positionId, fields, `TP ${tp}${sl ? ` (SL preserved ${sl})` : ""}`);
      const pos = state.positions.get(positionId);
      if (pos) pos.tp = tp;
    }, delayMs);
  }

  if (!sl && !tp) {
    console.log(`[AMEND] No SL/TP to set for position #${positionId}`);
  }
}
