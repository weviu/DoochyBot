import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RotateCcw, Timer } from "lucide-react";
import { api, type Settings as SettingsData, type StatusData } from "../lib/api";
import { notify } from "../lib/telegram";
import { Button, Chip, Flash, NumberField, SectionCard, Skeleton, Toggle } from "./ui";
import { FadeRise } from "./motion";
import { ConfirmModal } from "./Modal";

// The settings control panel. Every field maps to the exact Telegram command
// its handler expects (src/bot/commands/*), relayed through /api/command so the
// panel and the chat behave identically. After each change we refresh from the
// settings snapshot the relay returns, so the UI always reflects agent truth.

export function Settings({ status }: { status: StatusData | null }) {
  const [s, setS] = useState<SettingsData | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [addSym, setAddSym] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  // A message shown inline in the Symbols section (the add/remove result),
  // separate from the page-top flash so it's visible right where you're typing.
  const [symMsg, setSymMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await api.settings());
    } catch (e: any) {
      showFlash("danger", e?.message || "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (symMsgTimer.current) clearTimeout(symMsgTimer.current);
    };
  }, [load]);

  function showFlash(tone: "success" | "danger", text: string) {
    setFlash({ tone, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 5000);
  }

  function showSymMsg(tone: "success" | "danger", text: string) {
    setSymMsg({ tone, text });
    if (symMsgTimer.current) clearTimeout(symMsgTimer.current);
    symMsgTimer.current = setTimeout(() => setSymMsg(null), 5000);
  }

  // Run one command, surface its reply, and refresh settings from the snapshot
  // the relay returns (falling back to a re-fetch if none came back).
  const run = useCallback(async (cmd: string, args: string[]) => {
    try {
      const res = await api.command(cmd, args);
      if (res.settings) setS(res.settings);
      else await load();
      // The relay returns 200 even when a handler declines the change (e.g. an
      // unknown symbol, an out-of-range value). Treat a "not added / not a /
      // must be" style reply as a soft failure so it flashes red, not green.
      const rejected = /\bnot added\b|\bnot a\b|\bmust be\b|\bunknown\b|\binvalid\b|\bfailed\b/i.test(res.text);
      notify(rejected ? "error" : "success");
      showFlash(rejected ? "danger" : "success", res.text);
    } catch (e: any) {
      notify("error");
      showFlash("danger", e?.message || "Command failed");
      throw e; // let the calling control clear its own loading state
    }
  }, [load]);

  if (!s) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const cooldowns = status?.cooldowns ?? [];

  return (
    <div className="space-y-6">
      {flash && <FadeRise><Flash tone={flash.tone}>{flash.text}</Flash></FadeRise>}

      {/* ---- Risk & sizing ---------------------------------------------------*/}
      <SectionCard title="Risk & sizing" description="How each trade is sized.">
        <NumberField
          label="Per-trade risk"
          help="Max $ lost if a stop is hit. Required to trade (0 = off)."
          value={s.riskPerTradeUSD}
          suffix="$"
          min={0}
          onSave={(n) => run("risk", ["pertrade", String(n)])}
        />
        <NumberField
          label="Max positions"
          help="Concurrent open positions (1-20)."
          value={s.maxPositions}
          min={1}
          max={20}
          onSave={(n) => run("risk", ["maxpos", String(n)])}
        />
        <NumberField
          label="Min hold"
          help="Seconds to hold before the TP is set (0 = immediate)."
          value={s.minHoldSeconds}
          suffix="s"
          min={0}
          max={3600}
          onSave={(n) => run("minhold", [String(n)])}
        />
      </SectionCard>

      {/* ---- Daily limits ---------------------------------------------------*/}
      <SectionCard title="Daily limits" description="Force close all guards.">
        <NumberField
          label="Daily loss limit"
          help="Closes everything and stops for the day when hit."
          value={s.maxDailyLossUSD}
          suffix="$"
          min={1}
          onSave={(n) => run("risk", ["maxloss", String(n)])}
        />
        <NumberField
          label="Profit cap"
          help="Closes everything once profit reaches this (0 = off)."
          value={s.dailyProfitCapUSD}
          suffix="$"
          min={0}
          onSave={(n) => run("risk", ["cap", String(n)])}
        />
        <NumberField
          label="Cap buffer"
          help="Trigger the cap this many $ early so a spike can't overshoot it."
          value={s.capBufferUSD}
          suffix="$"
          min={0}
          onSave={(n) => run("risk", ["capbuffer", String(n)])}
        />
      </SectionCard>

      {/* ---- Symbols --------------------------------------------------------*/}
      <SectionCard title="Symbols" description={`${s.allowedSymbols.length} allowed.`}>
        {symMsg && <Flash tone={symMsg.tone}>{symMsg.text}</Flash>}
        <div className="flex flex-wrap gap-2">
          {s.allowedSymbols.length === 0 && (
            <span className="text-xs text-fg-faint">None. Add one below.</span>
          )}
          {s.allowedSymbols.map((sym) => (
            <Chip key={sym} onRemove={() => run("symbols", ["remove", sym])}>{sym}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={addSym}
            onChange={(e) => setAddSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && addSym.trim()) addSymbol(); }}
            placeholder="e.g. XAUUSD"
            className="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm uppercase text-fg placeholder:text-fg-faint placeholder:normal-case focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button
            size="md"
            variant="primary"
            disabled={!addSym.trim()}
            onClickAsync={addSym.trim() ? addSymbol : undefined}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
        </div>
      </SectionCard>

      {/* ---- Cooldowns & prop rules -----------------------------------------*/}
      <SectionCard
        title="Cooldowns & prop rules"
        description="Consecutive loss and per trade idea protections."
      >
        {cooldowns.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs text-fg-muted">
              <Timer className="h-3.5 w-3.5" /> Active cooldowns
            </div>
            <div className="flex flex-wrap gap-2">
              {cooldowns.map((c) => (
                <Chip key={c.symbol}>{c.symbol} {Math.ceil(c.remainingMs / 60000)}m</Chip>
              ))}
            </div>
            <div className="mt-3">
              <Button size="sm" variant="ghost" onClickAsync={() => run("cooldown", ["reset"])}>
                Clear all cooldowns
              </Button>
            </div>
          </div>
        )}
        <NumberField
          label="Consecutive losses"
          help="SL hits on one symbol in the window that trigger a cooldown (0 = off)."
          value={s.maxConsecutiveLosses}
          min={0}
          max={20}
          onSave={(n) => run("risk", ["losses", String(n)])}
        />
        <NumberField
          label="Loss window"
          help="Rolling window for counting SL hits."
          value={s.lossWindowMinutes}
          suffix="m"
          min={1}
          max={1440}
          onSave={(n) => run("risk", ["losswindow", String(n)])}
        />
        <NumberField
          label="Cooldown"
          help="How long a symbol is paused after the streak."
          value={s.cooldownMinutes}
          suffix="m"
          min={1}
          max={1440}
          onSave={(n) => run("risk", ["cooldown", String(n)])}
        />
        <NumberField
          label="Re-entry cooldown"
          help="Block reopening the same symbol+direction after a loss (0 = off)."
          value={s.reentryCooldownMinutes}
          suffix="m"
          min={0}
          max={1440}
          onSave={(n) => run("risk", ["reentry", String(n)])}
        />
        <NumberField
          label="Combined risk limit"
          help="Cap summed risk of all positions in one symbol+direction (0 = off)."
          value={s.maxCombinedRiskUSD}
          suffix="$"
          min={0}
          onSave={(n) => run("risk", ["combined", String(n)])}
        />
      </SectionCard>

      {/* ---- Signal gates ---------------------------------------------------*/}
      <SectionCard
        title="Signal gates"
        description="Which signals are allowed through."
        defaultOpen={false}
      >
        <NumberField
          label="Min confidence"
          help="Reject feed signals below this; channel signals bypass it (0 = off)."
          value={s.minConfidence}
          min={0}
          max={100}
          onSave={(n) => run("risk", ["minconfidence", String(n)])}
        />
        <Toggle
          label="Margin-aware sizing"
          help="Cap each order to fit free margin."
          checked={s.marginAware}
          onToggle={(on) => run("risk", ["marginaware", on ? "on" : "off"])}
        />
      </SectionCard>

      {/* ---- Notifications --------------------------------------------------*/}
      <SectionCard
        title="Notifications"
        description="Telegram alerts."
        defaultOpen={false}
      >
        <Toggle
          label="Order fills"
          help="Message you when an order fills."
          checked={s.notifyFills}
          onToggle={(on) => run("notifications", [on ? "on" : "off"])}
        />
        <Toggle
          label="Signal notifications"
          help="Message you for every incoming signal, executed or not."
          checked={s.signalNotify}
          onToggle={(on) => run("notifications", ["signals", on ? "on" : "off"])}
        />
        {s.signalNotify && (
          <NumberField
            label="Signal min confidence"
            help="Only notify on signals scoring at least this."
            value={s.signalNotifyMinConfidence}
            min={0}
            max={100}
            onSave={(n) => run("notifications", ["signals", "min", String(n)])}
          />
        )}
      </SectionCard>

      <ConfirmModal
        open={confirmReset}
        title="Reset symbols?"
        body="This restores the default symbol list (BTCUSD, XAUUSD, XAGUSD) and drops any you added."
        confirmLabel="Reset"
        danger
        onConfirm={() => run("symbols", ["reset"])}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );

  async function addSymbol() {
    const sym = addSym.trim().toUpperCase();
    if (!sym) return;
    const wasPresent = s?.allowedSymbols?.includes(sym) ?? false;
    try {
      const res = await api.command("symbols", ["add", sym]);
      if (res.settings) setS(res.settings);
      else await load();
      // Source of truth: did the symbol actually land in the allowed list? If
      // the agent refused it (unknown symbol, can't value in USD), it won't be
      // there, so show a clear warning instead of the verbose relay text.
      const nowPresent = res.settings?.allowedSymbols?.includes(sym);
      if (nowPresent && !wasPresent) {
        notify("success");
        showSymMsg("success", `Added ${sym}.`);
        setAddSym("");
      } else if (nowPresent) {
        notify("warning");
        showSymMsg("danger", `${sym} is already in the list.`);
      } else {
        notify("error");
        showSymMsg("danger", `${sym} is not a valid tradable symbol. Check the ticker (e.g. XAUUSD, BTCUSD).`);
        // Keep the input so the user can correct the typo.
      }
    } catch (e: any) {
      notify("error");
      showSymMsg("danger", e?.message || "Could not add symbol");
    }
  }
}
