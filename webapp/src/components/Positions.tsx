import { ArrowUpRight, ArrowDownRight, Timer } from "lucide-react";
import type { PositionsData } from "../lib/api";
import { pnl } from "../lib/format";
import { Card, Badge, Skeleton } from "./ui";
import { Stagger, StaggerItem, FadeRise } from "./motion";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-faint">{label}</div>
      <div className="mt-0.5 text-sm tabular-nums text-fg">{value}</div>
    </div>
  );
}

export function Positions({ data }: { data: PositionsData | null }) {
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
        {data.positions.map((p) => {
          const isBuy = p.direction === "BUY";
          return (
            <StaggerItem key={p.posId}>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={isBuy ? "success" : "danger"}>
                      {isBuy ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {p.direction}
                    </Badge>
                    <span className="text-sm font-semibold tracking-tight">{p.symbol}</span>
                    <span className="text-xs text-fg-faint">{p.volume}L</span>
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
              </Card>
            </StaggerItem>
          );
        })}
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
