import { state, persistSettings } from "../../state";

// Toggle the Telegram message sent whenever an order fills.
export async function notificationsCmd(ctx: any) {
  const arg = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();

  if (arg === "on" || arg === "off") {
    state.settings.notifyFills = arg === "on";
    persistSettings();
    await ctx.reply(
      state.settings.notifyFills
        ? "Order notifications on. You will get a message when an order fills."
        : "Order notifications off."
    );
    return;
  }

  await ctx.reply(`Order notifications are ${state.settings.notifyFills ? "on" : "off"}. Usage: /notifications on | off`);
}
