import { state } from "../../state";

export async function resumeCmd(ctx: any) {
  state.paused = false;
  await ctx.reply("Trading resumed.");
}