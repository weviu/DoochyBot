"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskCmd = riskCmd;
const state_1 = require("../../state");
async function riskCmd(ctx) {
    const msg = ctx.message.text.trim();
    const parts = msg.split(/\s+/);
    if (parts.length < 2) {
        await ctx.reply("Usage: /risk maxpos <n> | /risk daily <%> | /risk maxloss <usd> | /risk lotsize <lots>");
        return;
    }
    const setting = parts[1]?.toLowerCase();
    if (setting === "maxpos" && parts[2]) {
        const n = parseInt(parts[2]);
        if (isNaN(n) || n < 1 || n > 20) {
            await ctx.reply("Max positions must be between 1 and 20.");
            return;
        }
        state_1.state.settings.maxPositions = n;
        (0, state_1.persistSettings)();
        await ctx.reply(`Max positions set to ${n}.`);
        return;
    }
    if (setting === "daily" && parts[2]) {
        const pct = parseFloat(parts[2]);
        if (isNaN(pct) || pct < 0.1 || pct > 100) {
            await ctx.reply("Daily loss limit must be between 0.1 and 100.");
            return;
        }
        state_1.state.settings.dailyLossLimitPercent = pct;
        (0, state_1.persistSettings)();
        await ctx.reply(`Daily loss limit set to ${pct}%.`);
        return;
    }
    if (setting === "maxloss" && parts[2]) {
        const usd = parseFloat(parts[2]);
        if (isNaN(usd) || usd < 1) {
            await ctx.reply("Max daily loss USD must be at least 1.");
            return;
        }
        state_1.state.settings.maxDailyLossUSD = usd;
        (0, state_1.persistSettings)();
        await ctx.reply(`Max daily loss set to $${usd}.`);
        return;
    }
    if (setting === "lotsize" && parts[2]) {
        const lots = parseFloat(parts[2]);
        if (isNaN(lots) || lots < 0.01 || lots > 100) {
            await ctx.reply("Lot size must be between 0.01 and 100.");
            return;
        }
        state_1.state.settings.lotSize = lots;
        (0, state_1.persistSettings)();
        await ctx.reply(`Lot size set to ${lots}.`);
        return;
    }
    if (setting === "sl" && parts[2]) {
        const pct = parseFloat(parts[2]);
        if (isNaN(pct) || pct < 0.05 || pct > 50) {
            await ctx.reply("Stop loss % must be between 0.05 and 50.");
            return;
        }
        state_1.state.settings.stopLossPercent = pct;
        (0, state_1.persistSettings)();
        await ctx.reply(`Stop loss set to ${pct}% of entry.`);
        return;
    }
    if (setting === "tp" && parts[2]) {
        const pct = parseFloat(parts[2]);
        if (isNaN(pct) || pct < 0.05 || pct > 50) {
            await ctx.reply("Take profit % must be between 0.05 and 50.");
            return;
        }
        state_1.state.settings.takeProfitPercent = pct;
        (0, state_1.persistSettings)();
        await ctx.reply(`Take profit set to ${pct}% of entry.`);
        return;
    }
    await ctx.reply("Unknown setting. Usage: /risk maxpos <n> | /risk daily <pct> | /risk maxloss <usd> | /risk lotsize <lots> | /risk sl <pct> | /risk tp <pct>");
}
//# sourceMappingURL=risk.js.map