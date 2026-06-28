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
// Parse the symbol arguments after the action (parts[0] = /symbols, parts[1] =
// add/remove). Accepts a comma and/or space separated list, e.g.
// "BTCUSD,ETHUSD POOPUSD", uppercased and de-duplicated.
function parseSymbols(parts) {
    const syms = parts
        .slice(2)
        .join(" ")
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    return [...new Set(syms)];
}
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
    // /symbols add <SYM>[,<SYM>...] - one or more symbols, comma or space separated
    if (action === "add" && parts[2]) {
        const syms = parseSymbols(parts);
        const added = [];
        const already = [];
        for (const sym of syms) {
            if (state_1.state.settings.allowedSymbols.includes(sym))
                already.push(sym);
            else {
                state_1.state.settings.allowedSymbols.push(sym);
                added.push(sym);
            }
        }
        if (added.length)
            (0, state_1.persistSettings)();
        const out = [];
        if (added.length)
            out.push(`Added: ${added.join(", ")}`);
        if (already.length)
            out.push(`Already present: ${already.join(", ")}`);
        out.push(`Allowed: ${state_1.state.settings.allowedSymbols.join(", ")}`);
        await ctx.reply(out.join("\n"));
        return;
    }
    // /symbols remove <SYM>[,<SYM>...] - one or more symbols, comma or space separated
    if (action === "remove" && parts[2]) {
        const syms = parseSymbols(parts);
        const removed = [];
        const notFound = [];
        for (const sym of syms) {
            const idx = state_1.state.settings.allowedSymbols.indexOf(sym);
            if (idx === -1)
                notFound.push(sym);
            else {
                state_1.state.settings.allowedSymbols.splice(idx, 1);
                removed.push(sym);
            }
        }
        if (removed.length)
            (0, state_1.persistSettings)();
        const out = [];
        if (removed.length)
            out.push(`Removed: ${removed.join(", ")}`);
        if (notFound.length)
            out.push(`Not in list: ${notFound.join(", ")}`);
        out.push(`Allowed: ${state_1.state.settings.allowedSymbols.join(", ")}`);
        await ctx.reply(out.join("\n"));
        return;
    }
    await ctx.reply("Usage: /symbols | /symbols add <SYM>[,<SYM>...] | /symbols add all | /symbols remove <SYM>[,<SYM>...] | /symbols reset");
}
//# sourceMappingURL=symbols.js.map