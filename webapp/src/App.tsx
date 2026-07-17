import { useCallback, useEffect, useState } from "react";
import { Play, Pause, XOctagon, RefreshCw, AlertCircle } from "lucide-react";
import { api, type StatusData, type PositionsData } from "./lib/api";
import { notify } from "./lib/telegram";
import { Button, Card } from "./components/ui";
import { Dashboard } from "./components/Dashboard";
import { Positions } from "./components/Positions";
import { Settings } from "./components/Settings";
import { Trade } from "./components/Trade";
import { ConfirmModal } from "./components/Modal";

type Tab = "dashboard" | "positions" | "trade" | "settings";

const POLL_MS = 5000;

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [positions, setPositions] = useState<PositionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.status(), api.positions()]);
      setStatus(s);
      setPositions(p);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const paused = status?.paused ?? false;

  async function togglePause() {
    try {
      if (paused) await api.resume();
      else await api.pause();
      notify("success");
      await refresh();
    } catch (e: any) {
      notify("error");
      setError(e?.message || "Action failed");
    }
  }

  async function doCloseAll() {
    try {
      const r = await api.closeall();
      notify(r.failed > 0 ? "warning" : "success");
      await refresh();
    } catch (e: any) {
      notify("error");
      setError(e?.message || "Close all failed");
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">DoochyBot</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClickAsync={refresh} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant={paused ? "primary" : "secondary"} onClickAsync={togglePause}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl gap-1 px-4 pb-2">
          {(["dashboard", "positions", "trade", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition " +
                (tab === t
                  ? "border border-accent/20 bg-accent-soft text-accent"
                  : "border border-transparent text-fg-muted hover:text-fg hover:bg-surface-hover")
              }
            >
              {t}
              {t === "positions" && status ? ` (${status.openPositions})` : ""}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {error && (
          <Card className="mb-4 border-danger/30 bg-danger-soft p-4">
            <div className="flex items-center gap-2 text-sm text-danger">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          </Card>
        )}

        {tab === "dashboard" && <Dashboard status={status} />}
        {tab === "positions" && <Positions data={positions} onChanged={refresh} />}
        {tab === "trade" && <Trade />}
        {tab === "settings" && <Settings status={status} />}

        {tab !== "settings" && tab !== "trade" && status && status.openPositions > 0 && (
          <div className="mt-6">
            <Button variant="danger" size="lg" className="w-full" onClick={() => setConfirmClose(true)}>
              <XOctagon className="h-4 w-4" /> Close all positions
            </Button>
          </div>
        )}
      </main>

      <ConfirmModal
        open={confirmClose}
        title="Close all positions?"
        body={`This immediately market-closes all ${status?.openPositions ?? 0} open position(s). This cannot be undone.`}
        confirmLabel="Close all"
        danger
        onConfirm={doCloseAll}
        onClose={() => setConfirmClose(false)}
      />
    </div>
  );
}
