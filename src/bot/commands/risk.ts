import { state, persistSettings } from "../../state";

export async function riskCmd(ctx: any) {
  const msg = ctx.message.text.trim();
  const parts = msg.split(/\s+/);

  if (parts.length < 2) {
    await ctx.reply("Usage: /risk pertrade <usd> | /risk sl <pct> | /risk tp <pct> | /risk maxpos <n> | /risk maxloss <usd> | /risk cap <usd>");
    return;
  }

  const setting = parts[1]?.toLowerCase();

  if (setting === "maxpos" && parts[2]) {
    const n = parseInt(parts[2]);
    if (isNaN(n) || n < 1 || n > 20) {
      await ctx.reply("Max positions must be between 1 and 20.");
      return;
    }
    state.settings.maxPositions = n;
    persistSettings();
    await ctx.reply(`Max positions set to ${n}.`);
    return;
  }

  if (setting === "maxloss" && parts[2]) {
    const usd = parseFloat(parts[2]);
    if (isNaN(usd) || usd < 1) {
      await ctx.reply("Max daily loss USD must be at least 1.");
      return;
    }
    state.settings.maxDailyLossUSD = usd;
    persistSettings();
    await ctx.reply(`Max daily loss set to $${usd}.`);
    return;
  }

  if (setting === "cap" && parts[2]) {
    const usd = parseFloat(parts[2]);
    if (isNaN(usd) || usd < 0) {
      await ctx.reply("Profit cap USD must be 0 (disabled) or greater.");
      return;
    }
    state.settings.dailyProfitCapUSD = usd;
    persistSettings();
    await ctx.reply(
      usd === 0
        ? "Daily profit cap disabled."
        : `Daily profit cap set to $${usd}. Once realized + floating P&L reaches it, ALL positions are force-closed and new signals stop for the day. Buffer: $${(state.settings.capBufferUSD ?? 0).toFixed(2)} below cap.`
    );
    return;
  }

  if (setting === "capbuffer" && parts[2]) {
    const usd = parseFloat(parts[2]);
    if (isNaN(usd) || usd < 0) {
      await ctx.reply("Cap buffer USD must be 0 or greater.");
      return;
    }
    state.settings.capBufferUSD = usd;
    persistSettings();
    await ctx.reply(
      usd === 0
        ? "Cap buffer cleared — positions close exactly at the cap."
        : `Cap buffer set to $${usd}. Positions force-close once profit reaches cap − $${usd}, so the cap is never overshot.`
    );
    return;
  }

  if (setting === "losses" && parts[2]) {
    const n = parseInt(parts[2]);
    if (isNaN(n) || n < 0 || n > 20) {
      await ctx.reply("Consecutive losses must be 0 (disabled) to 20.");
      return;
    }
    state.settings.maxConsecutiveLosses = n;
    persistSettings();
    await ctx.reply(
      n === 0
        ? "Consecutive-loss protection disabled."
        : `Consecutive-loss protection: ${n} SL hits within ${state.settings.lossWindowMinutes}m → ${state.settings.cooldownMinutes}m cooldown.`
    );
    return;
  }

  if (setting === "losswindow" && parts[2]) {
    const min = parseInt(parts[2]);
    if (isNaN(min) || min < 1 || min > 1440) {
      await ctx.reply("Loss window must be between 1 and 1440 minutes.");
      return;
    }
    state.settings.lossWindowMinutes = min;
    persistSettings();
    await ctx.reply(`Loss-counting window set to ${min} minutes.`);
    return;
  }

  if (setting === "cooldown" && parts[2]) {
    const min = parseInt(parts[2]);
    if (isNaN(min) || min < 1 || min > 1440) {
      await ctx.reply("Cooldown must be between 1 and 1440 minutes.");
      return;
    }
    state.settings.cooldownMinutes = min;
    persistSettings();
    await ctx.reply(`Per-symbol cooldown set to ${min} minutes.`);
    return;
  }

  if (setting === "reentry" && parts[2] !== undefined) {
    const min = parseInt(parts[2]);
    if (isNaN(min) || min < 0 || min > 1440) {
      await ctx.reply("Re-entry cooldown must be between 0 and 1440 minutes (0 = off).");
      return;
    }
    state.settings.reentryCooldownMinutes = min;
    persistSettings();
    await ctx.reply(
      min === 0
        ? "Re-entry cooldown disabled."
        : `Re-entry cooldown set to ${min} minutes (blocks reopening the same symbol+direction after a loss).`
    );
    return;
  }

  if (setting === "combined" && parts[2] !== undefined) {
    const usd = parseFloat(parts[2]);
    if (isNaN(usd) || usd < 0 || usd > 100000) {
      await ctx.reply("Combined risk limit must be between 0 and 100000 USD (0 = off).");
      return;
    }
    state.settings.maxCombinedRiskUSD = usd;
    persistSettings();
    await ctx.reply(
      usd === 0
        ? "Combined risk limit disabled."
        : `Combined risk limit set to $${usd} (max summed risk across all positions of the same symbol+direction).`
    );
    return;
  }

  if (setting === "confidence" && parts[2] !== undefined) {
    const n = parseInt(parts[2]);
    if (isNaN(n) || n < 0 || n > 100) {
      await ctx.reply("Channel confidence must be between 0 and 100 (default 69).");
      return;
    }
    state.settings.webhookConfidence = n;
    persistSettings();
    await ctx.reply(`Channel signal confidence set to ${n}. Channel signals can now flip an open position with lower confidence; feed signals need a higher score to flip a channel position.`);
    return;
  }

  if (setting === "minconfidence" && parts[2] !== undefined) {
    const n = parseInt(parts[2]);
    if (isNaN(n) || n < 0 || n > 100) {
      await ctx.reply("Minimum confidence must be between 0 and 100% (0 = off).");
      return;
    }
    state.settings.minConfidence = n;
    persistSettings();
    await ctx.reply(
      n === 0
        ? "Minimum confidence gate disabled. All feed signals may open positions."
        : `Minimum confidence set to ${n}. Feed signals scoring below ${n} are rejected; channel signals bypass this.`
    );
    return;
  }

  if (setting === "marginaware" && parts[2] !== undefined) {
    const arg = parts[2].toLowerCase();
    if (arg !== "on" && arg !== "off") {
      await ctx.reply("Usage: /risk marginaware on | off");
      return;
    }
    state.settings.marginAware = arg === "on";
    persistSettings();
    await ctx.reply(
      state.settings.marginAware
        ? "Margin-aware sizing on. Each order is capped to fit the account's free margin."
        : "Margin-aware sizing off. Orders use the full risk-based size; manage margin via /risk pertrade, /risk sl, and /risk maxpos."
    );
    return;
  }


  // "pertrade" is the documented name; "risk" kept as a silent alias so older
  // muscle memory still works.
  if ((setting === "pertrade" || setting === "risk") && parts[2]) {
    const usd = parseFloat(parts[2]);
    if (isNaN(usd) || usd < 0) {
      await ctx.reply("Per-trade risk USD must be 0 (disabled) or greater.");
      return;
    }
    state.settings.riskPerTradeUSD = usd;
    persistSettings();
    await ctx.reply(
      usd === 0
        ? "Per-trade risk sizing disabled — using fixed lot sizes."
        : `Per-trade risk set to $${usd}. Position size is now derived so a ${state.settings.stopLossPercent}% stop loses ~$${usd}, regardless of symbol. Overrides fixed lot size (used as fallback when no live price yet).`
    );
    return;
  }

  if (setting === "sl" && parts[2] !== undefined) {
    // Per-symbol override form: /risk sl <SYM> <pct>  (pct 0 removes it)
    if (parts[3] !== undefined) {
      const sym = parts[2].toUpperCase();
      const pct = parseFloat(parts[3]);
      if (pct === 0) {
        delete state.settings.symbolStopLossPercent[sym];
        persistSettings();
        await ctx.reply(`Removed ${sym} stop loss override. Using the global ${state.settings.stopLossPercent}%.`);
        return;
      }
      if (isNaN(pct) || pct < 0.05 || pct > 50) {
        await ctx.reply("Stop loss % must be 0 (remove override) or between 0.05 and 50.");
        return;
      }
      state.settings.symbolStopLossPercent[sym] = pct;
      persistSettings();
      await ctx.reply(`${sym} stop loss set to ${pct}% (overrides the global ${state.settings.stopLossPercent}%).`);
      return;
    }
    // Global form: /risk sl <pct>
    const pct = parseFloat(parts[2]);
    if (isNaN(pct) || pct < 0.05 || pct > 50) {
      await ctx.reply("Stop loss % must be between 0.05 and 50.");
      return;
    }
    state.settings.stopLossPercent = pct;
    persistSettings();
    await ctx.reply(`Stop loss set to ${pct}% of entry.`);
    return;
  }

  if (setting === "tp" && parts[2] !== undefined) {
    // Per-symbol override form: /risk tp <SYM> <pct>  (pct 0 removes it)
    if (parts[3] !== undefined) {
      const sym = parts[2].toUpperCase();
      const pct = parseFloat(parts[3]);
      if (pct === 0) {
        delete state.settings.symbolTakeProfitPercent[sym];
        persistSettings();
        await ctx.reply(`Removed ${sym} take profit override. Using the global ${state.settings.takeProfitPercent}%.`);
        return;
      }
      if (isNaN(pct) || pct < 0.05 || pct > 50) {
        await ctx.reply("Take profit % must be 0 (remove override) or between 0.05 and 50.");
        return;
      }
      state.settings.symbolTakeProfitPercent[sym] = pct;
      persistSettings();
      await ctx.reply(`${sym} take profit set to ${pct}% (overrides the global ${state.settings.takeProfitPercent}%).`);
      return;
    }
    // Global form: /risk tp <pct>
    const pct = parseFloat(parts[2]);
    if (isNaN(pct) || pct < 0.05 || pct > 50) {
      await ctx.reply("Take profit % must be between 0.05 and 50.");
      return;
    }
    state.settings.takeProfitPercent = pct;
    persistSettings();
    await ctx.reply(`Take profit set to ${pct}% of entry.`);
    return;
  }

  await ctx.reply("Unknown setting. Usage: /risk pertrade <usd> | /risk sl <pct> | /risk tp <pct> | /risk sl <SYM> <pct> | /risk tp <SYM> <pct> | /risk maxpos <n> | /risk maxloss <usd> | /risk cap <usd> | /risk capbuffer <usd> | /risk losses <n> | /risk losswindow <min> | /risk cooldown <min> | /risk reentry <min> | /risk combined <usd> | /risk confidence <n> | /risk minconfidence <n>% | /risk marginaware on|off");
}