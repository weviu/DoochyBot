"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.symbolsCmd = symbolsCmd;
const state_1 = require("../../state");
const SYMBOL_ALIASES = {
    AAVE: "AAVUSD",
    ALGO: "ALGUSD",
    AVAX: "AVAUSD",
    LINK: "LNKUSD",
};
async function symbolsCmd(ctx) {
    const msg = ctx.message.text.trim();
    const parts = msg.split(/\s+/);
    // /symbols (no args) - list
    if (parts.length === 1) {
        if (state_1.state.settings.allowedSymbols.length === 0) {
            await ctx.reply("No symbols configured.");
            return;
        }
        await ctx.reply("Allowed symbols:\n" + state_1.state.settings.allowedSymbols.join("\n"));
        return;
    }
    const action = parts[1]?.toLowerCase();
    // /symbols reset - restore the default symbol list
    if (action === "reset") {
        state_1.state.settings.allowedSymbols = [...state_1.DEFAULT_SETTINGS.allowedSymbols];
        (0, state_1.persistSettings)();
        await ctx.reply(`Symbol list reset to defaults: ${state_1.state.settings.allowedSymbols.join(", ")}`);
        return;
    }
    // /symbols add all - add all symbols from the feed with confidence >= 3
    if (action === "add" && parts[2]?.toLowerCase() === "all") {
        try {
            const res = await fetch("https://signals.route07.com/rsi_alerts.json");
            const alerts = await res.json();
            const symbols = new Set();
            for (const alert of alerts) {
                if (alert.confidence >= 3) {
                    const base = alert.symbol.split("/")[0].toUpperCase();
                    const resolved = SYMBOL_ALIASES[base] || `${base}USD`;
                    symbols.add(resolved);
                }
            }
            let added = 0;
            for (const sym of symbols) {
                if (!state_1.state.settings.allowedSymbols.includes(sym)) {
                    state_1.state.settings.allowedSymbols.push(sym);
                    added++;
                }
            }
            (0, state_1.persistSettings)();
            await ctx.reply(`Added ${added} symbols with confidence >= 3. Total allowed: ${state_1.state.settings.allowedSymbols.length}`);
        }
        catch (err) {
            await ctx.reply(`Failed to fetch feed: ${err.message}`);
        }
        return;
    }
    // /symbols add <symbol>
    if (action === "add" && parts[2]) {
        const symbol = parts[2].toUpperCase();
        if (state_1.state.settings.allowedSymbols.includes(symbol)) {
            await ctx.reply(`${symbol} already in allowed list.`);
            return;
        }
        state_1.state.settings.allowedSymbols.push(symbol);
        (0, state_1.persistSettings)();
        await ctx.reply(`Added ${symbol}. Allowed: ${state_1.state.settings.allowedSymbols.join(", ")}`);
        return;
    }
    // /symbols remove <symbol>
    if (action === "remove" && parts[2]) {
        const symbol = parts[2].toUpperCase();
        const idx = state_1.state.settings.allowedSymbols.indexOf(symbol);
        if (idx === -1) {
            await ctx.reply(`${symbol} not in allowed list.`);
            return;
        }
        state_1.state.settings.allowedSymbols.splice(idx, 1);
        (0, state_1.persistSettings)();
        await ctx.reply(`Removed ${symbol}. Allowed: ${state_1.state.settings.allowedSymbols.join(", ")}`);
        return;
    }
    await ctx.reply("Usage: /symbols | /symbols add <SYM> | /symbols add all | /symbols remove <SYM> | /symbols reset");
}
//# sourceMappingURL=symbols.js.map