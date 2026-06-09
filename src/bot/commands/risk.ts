import { state, persistSettings } from "../../state";

export async function riskCmd(ctx: any) {
  const msg = ctx.message.text.trim();
  const parts = msg.split(/\s+/);

  if (parts.length < 2) {
    await ctx.reply("Usage: /risk maxpos <n> | /risk daily <%> | /risk maxloss <usd> | /risk cap <usd> | /risk lotsize <lots>");
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

  if (setting === "daily" && parts[2]) {
    const pct = parseFloat(parts[2]);
    if (isNaN(pct) || pct < 0.1 || pct > 100) {
      await ctx.reply("Daily loss limit must be between 0.1 and 100.");
      return;
    }
    state.settings.dailyLossLimitPercent = pct;
    persistSettings();
    await ctx.reply(`Daily loss limit set to ${pct}%.`);
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
        : `Daily profit cap set to $${usd}. New signals stop for the day once realized profit reaches it; open positions are unaffected.`
    );
    return;
  }

  if (setting === "trend" && parts[2]) {
    const hours = parseFloat(parts[2]);
    if (isNaN(hours) || hours < 0 || hours > 168) {
      await ctx.reply("Trend lookback hours must be 0 (disabled) to 168.");
      return;
    }
    state.settings.trendLookbackHours = hours;
    persistSettings();
    await ctx.reply(
      hours === 0
        ? "Trend filter disabled."
        : `Trend filter on: only take signals aligned with the ${hours}h price trend.`
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

  if (setting === "lotsize" && parts[2]) {
    const lots = parseFloat(parts[2]);
    if (isNaN(lots) || lots < 0.01 || lots > 100) {
      await ctx.reply("Lot size must be between 0.01 and 100.");
      return;
    }
    state.settings.lotSize = lots;
    persistSettings();
    await ctx.reply(`Lot size set to ${lots}.`);
    return;
  }

  if (setting === "sl" && parts[2]) {
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

  if (setting === "tp" && parts[2]) {
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

  await ctx.reply("Unknown setting. Usage: /risk maxpos <n> | /risk daily <pct> | /risk maxloss <usd> | /risk cap <usd> | /risk trend <hours> | /risk losses <n> | /risk losswindow <min> | /risk cooldown <min> | /risk lotsize <lots> | /risk sl <pct> | /risk tp <pct>");
}