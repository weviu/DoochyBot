import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Timer, XOctagon } from "lucide-react";
import type { PositionsData, PositionRow } from "../lib/api";
import { api } from "../lib/api";
import { notify } from "../lib/telegram";
import { pnl, money } from "../lib/format";
import { Card, Badge, Skeleton, Button, Flash } from "./ui";
import { Stagger, StaggerItem, FadeRise } from "./motion";
import { ConfirmModal } from "./Modal";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-faint">{label}</div>
      <div className="mt-0.5 text-sm tabular-nums text-fg">{value}</div>
    </div>
  );
}

function heldFor(openTime: number): string {
  const ms = Date.now() - openTime;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function Positions({ data, onChanged }: { data: PositionsData | null; onChanged?: () => void }) {
  // Only one card is expanded at a time; the 5s poll must never collapse it or
  // clobber a half-typed SL/TP, so expansion and drafts live here keyed by id.
  const [openId, setOpenId] = useState<number | null>(null);

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (data.positions.length === 0) {
    return (
      <FadeRise>
        <Card className="p-8 text-center">
          <div className="text-sm text-fg-muted">No open positions</div>
        </Card>
      </FadeRise>
    );
  }

  return (
    <div className="space-y-4">
      <Stagger className="space-y-3">
        {data.positions.map((p) => (
          <StaggerItem key={p.posId}>
            <PositionCard
              p={p}
              open={openId === p.posId}
              onToggle={() => setOpenId(openId === p.posId ? null : p.posId)}
              onChanged={onChanged}
            />
          </StaggerItem>
        ))}
      </Stagger>
      {data.positions.length > 1 && (
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-fg-muted">Total P&L</span>
          <span className={`font-semibold tabular-nums ${data.totalPnL >= 0 ? "text-success" : "text-danger"}`}>
            {pnl(data.totalPnL)}
          </span>
        </div>
      )}
    </div>
  );
}

function PositionCard({
  p, open, onToggle, onChanged,
}: {
  p: PositionRow;
  open: boolean;
  onToggle: () => void;
  onChanged?: () => void;
}) {
  const reduce = useReducedMotion();
  const isBuy = p.direction === "BUY";
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const costs = p.commission + p.swap;
  // What you'd actually walk away with: gross P&L, costs booked so far, and the
  // exit commission that isn't charged until the position closes.
  const netIfClosed = p.pnl + costs + p.commission;

  const slNum = sl.trim() ? Number(sl) : null;
  const tpNum = tp.trim() ? Number(tp) : null;
  const dirty = (slNum !== null && slNum !== p.sl) || (tpNum !== null && tpNum !== p.tp);

  // Same side rule the agent enforces; checked here for instant feedback.
  let sideErr: string | null = null;
  const ref = p.entryPrice;
  if (isBuy) {
    if (tpNum !== null && tpNum <= ref) sideErr = `For a BUY, TP must be above the entry (${ref}).`;
    else if (slNum !== null && slNum >= ref) sideErr = `For a BUY, SL must be below the entry (${ref}).`;
  } else {
    if (tpNum !== null && tpNum >= ref) sideErr = `For a SELL, TP must be below the entry (${ref}).`;
    else if (slNum !== null && slNum <= ref) sideErr = `For a SELL, SL must be above the entry (${ref}).`;
  }

  async function save() {
    try {
      const r = await api.amendPosition(p.posId, slNum ?? p.sl, tpNum ?? p.tp);
      notify("success");
      setMsg({ tone: "success", text: r.text });
      setSl(""); setTp("");
      onChanged?.();
    } catch (e: any) {
      notify("error");
      setMsg({ tone: "danger", text: e?.message || "Could not update" });
    }
  }

  async function doClose() {
    try {
      const r = await api.closePosition(p.posId);
      notify("success");
      setMsg({ tone: "success", text: r.text });
      onChanged?.();
    } catch (e: any) {
      notify("error");
      setMsg({ tone: "danger", text: e?.message || "Could not close" });
    }
  }

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full p-4 text-left transition hover:bg-surface-hover">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone={isBuy ? "success" : "danger"}>
              {isBuy ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {p.direction}
            </Badge>
            <span className="text-sm font-semibold tracking-tight">{p.symbol}</span>
            <span className="text-xs text-fg-faint">{p.volume}L</span>
            {p.source === "Manual" && <Badge tone="muted">manual</Badge>}
          </div>
          <div className={`text-sm font-semibold tabular-nums ${p.pnl >= 0 ? "text-success" : "text-danger"}`}>
            {pnl(p.pnl)}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Field label="Entry" value={String(p.entryPrice)} />
          <Field label="Mark" value={String(p.mark)} />
          <Field label="SL" value={p.sl != null ? String(p.sl) : "—"} />
          <Field label="TP" value={p.tp != null ? String(p.tp) : "—"} />
        </div>
        {p.timeExitMinLeft != null && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
            <Timer className="h-3.5 w-3.5" />
            {p.timeExitMinLeft > 0 ? `Time exit in ${p.timeExitMinLeft}m` : "Time exit due now"}
          </div>
        )}
        {costs !== 0 && (
          <div className="mt-3 border-t border-hairline pt-2 text-xs tabular-nums text-danger">
            Costs {pnl(costs)}
            {p.swap !== 0 && (
              <span className="text-fg-faint"> (commission {p.commission.toFixed(2)}, swap {p.swap.toFixed(2)})</span>
            )}
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="space-y-4 border-t border-hairline p-4">
              {msg && <Flash tone={msg.tone}>{msg.text}</Flash>}

              <div className="grid grid-cols-3 gap-3">
                <Field label="Held for" value={heldFor(p.openTime)} />
                <Field label="Net if closed" value={money(netIfClosed)} />
                <Field label="Position" value={`#${p.posId}`} />
              </div>
              <p className="text-xs text-fg-faint">
                Net includes the exit commission, which is not charged until the position closes.
              </p>

              {/* Edit SL/TP */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-fg-muted">Edit stop loss / take profit</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)}
                    placeholder={p.sl != null ? String(p.sl) : "SL"}
                    className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm tabular-nums text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <input
                    type="number" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)}
                    placeholder={p.tp != null ? String(p.tp) : "TP"}
                    className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm tabular-nums text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                {sideErr && <Flash tone="danger">{sideErr}</Flash>}
                <Button
                  size="sm" variant={dirty && !sideErr ? "primary" : "secondary"}
                  disabled={!dirty || !!sideErr}
                  onClickAsync={dirty && !sideErr ? save : undefined}
                >
                  Save levels
                </Button>
              </div>

              <div className="border-t border-hairline pt-3">
                <Button variant="danger" size="md" className="w-full" onClick={() => setConfirmClose(true)}>
                  <XOctagon className="h-4 w-4" /> Close position
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={confirmClose}
        title={`Close ${p.direction} ${p.symbol}?`}
        body={
          <span>
            Market-closes all {p.volume} lots now, realising{" "}
            <strong className={p.pnl >= 0 ? "text-success" : "text-danger"}>{pnl(p.pnl)}</strong> gross
            {" "}(about <strong className="text-fg">{money(netIfClosed)}</strong> net after costs). This cannot be undone.
          </span>
        }
        confirmLabel="Close position"
        danger
        onConfirm={doClose}
        onClose={() => setConfirmClose(false)}
      />
    </Card>
  );
}
