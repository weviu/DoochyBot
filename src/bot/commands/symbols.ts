import { state, persistSettings, DEFAULT_SETTINGS } from "../../state";

const SYMBOL_ALIASES: Record<string, string> = {
  AAVE: "AAVUSD",
  ALGO: "ALGUSD",
  AVAX: "AVAUSD",
  LINK: "LNKUSD",
};

export async function symbolsCmd(ctx: any) {
  const msg = ctx.message.text.trim();
  const parts = msg.split(/\s+/);

  // /symbols (no args) - list
  if (parts.length === 1) {
    if (state.settings.allowedSymbols.length === 0) {
      await ctx.reply("No symbols configured.");
      return;
    }
    const lines = state.settings.allowedSymbols.map((s) => {
      const custom = state.settings.symbolLotSize[s];
      const lots = custom ?? state.settings.lotSize;
      return `${s}: ${lots} lots${custom === undefined ? " (default)" : ""}`;
    });
    await ctx.reply("Allowed symbols:\n" + lines.join("\n"));
    return;
  }

  const action = parts[1]?.toLowerCase();

  // /symbols reset - restore the default symbol list
  if (action === "reset") {
    state.settings.allowedSymbols = [...DEFAULT_SETTINGS.allowedSymbols];
    persistSettings();
    await ctx.reply(`Symbol list reset to defaults: ${state.settings.allowedSymbols.join(", ")}`);
    return;
  }

  // /symbols add all - add all symbols from the feed with confidence >= 3
  if (action === "add" && parts[2]?.toLowerCase() === "all") {
    try {
      const res = await fetch("https://signals.route07.com/rsi_alerts.json");
      const alerts = await res.json();
      const symbols = new Set<string>();
      for (const alert of alerts) {
        if (alert.confidence >= 3) {
          const base = alert.symbol.split("/")[0].toUpperCase();
          const resolved = SYMBOL_ALIASES[base] || `${base}USD`;
          symbols.add(resolved);
        }
      }
      let added = 0;
      for (const sym of symbols) {
        if (!state.settings.allowedSymbols.includes(sym)) {
          state.settings.allowedSymbols.push(sym);
          added++;
        }
      }
      persistSettings();
      await ctx.reply(`Added ${added} symbols with confidence >= 3. Total allowed: ${state.settings.allowedSymbols.length}`);
    } catch (err: any) {
      await ctx.reply(`Failed to fetch feed: ${err.message}`);
    }
    return;
  }

  // /symbols add <symbol>
  if (action === "add" && parts[2]) {
    const symbol = parts[2].toUpperCase();
    if (state.settings.allowedSymbols.includes(symbol)) {
      await ctx.reply(`${symbol} already in allowed list.`);
      return;
    }
    state.settings.allowedSymbols.push(symbol);
    persistSettings();
    await ctx.reply(`Added ${symbol}. Allowed: ${state.settings.allowedSymbols.join(", ")}`);
    return;
  }

  // /symbols remove <symbol>
  if (action === "remove" && parts[2]) {
    const symbol = parts[2].toUpperCase();
    const idx = state.settings.allowedSymbols.indexOf(symbol);
    if (idx === -1) {
      await ctx.reply(`${symbol} not in allowed list.`);
      return;
    }
    state.settings.allowedSymbols.splice(idx, 1);
    persistSettings();
    await ctx.reply(`Removed ${symbol}. Allowed: ${state.settings.allowedSymbols.join(", ")}`);
    return;
  }

  // /symbols <SYMBOL> <lotsize> - set per-symbol lot size
  const symbol = parts[1]?.toUpperCase();
  const lots = parseFloat(parts[2]);
  if (symbol && !isNaN(lots)) {
    if (lots < 0.01 || lots > 100) {
      await ctx.reply("Lot size must be between 0.01 and 100.");
      return;
    }
    state.settings.symbolLotSize[symbol] = lots;
    persistSettings();
    await ctx.reply(
      `${symbol} lot size set to ${lots}.` +
      (state.settings.riskPerTradeUSD > 0
        ? ` ⚠ Ignored while per-trade risk is on ($${state.settings.riskPerTradeUSD}). Run /risk pertrade 0 to use lot sizes.`
        : "")
    );
    return;
  }

  await ctx.reply("Usage: /symbols | /symbols add <SYM> | /symbols add all | /symbols remove <SYM> | /symbols reset | /symbols <SYM> <lots>");
}