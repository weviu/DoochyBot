const { Bot } = require('grammy');
const { config } = require('../config');
const state = require('../state');

const { startCmd } = require('./commands/start');
const { helpCmd } = require('./commands/help');
const { statusCmd } = require('./commands/status');
const { balanceCmd } = require('./commands/balance');
const { positionsCmd } = require('./commands/positions');
const { pauseCmd } = require('./commands/pause');
const { resumeCmd } = require('./commands/resume');
const { closeallCmd } = require('./commands/closeall');
const { riskCmd } = require('./commands/risk');
const { symbolsCmd } = require('./commands/symbols');
const { confirmCmd } = require('./commands/confirm');
const { setchatidCmd } = require('./commands/setchatid');
const { exportCmd } = require('./commands/export');

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

let bot = null;

function startBot() {
  if (!config.telegram.botToken) {
    log('Warning: TELEGRAM_BOT_TOKEN not set, Telegram bot disabled');
    return;
  }

  bot = new Bot(config.telegram.botToken);

  const allowedUsers = config.telegram.allowedUsers;

  if (allowedUsers.length > 0) {
    bot.use(async (ctx, next) => {
      if (!allowedUsers.includes(String(ctx.from?.id))) {
        await ctx.reply('Unauthorized');
        return;
      }
      await next();
    });
  }

  bot.command('start', (ctx) => startCmd(ctx));
  bot.command('help', (ctx) => helpCmd(ctx));
  bot.command('status', (ctx) => statusCmd(ctx));
  bot.command('balance', (ctx) => balanceCmd(ctx));
  bot.command('positions', (ctx) => positionsCmd(ctx));
  bot.command('pause', (ctx) => pauseCmd(ctx));
  bot.command('resume', (ctx) => resumeCmd(ctx));
  bot.command('closeall', (ctx) => closeallCmd(ctx));
  bot.command('risk', (ctx) => riskCmd(ctx));
  bot.command('symbols', (ctx) => symbolsCmd(ctx));
  bot.command('confirm', (ctx) => confirmCmd(ctx));
  bot.command('setchatid', (ctx) => setchatidCmd(ctx));
  bot.command('export', (ctx) => exportCmd(ctx));

  bot.start();

  log(`Telegram bot started. Allowed users: ${allowedUsers.length > 0 ? allowedUsers.join(', ') : 'all'}`);
}

async function sendAlert(message) {
  const chatId = state.settings.chatId;
  if (!bot || !chatId) return;
  try {
    await bot.api.sendMessage(chatId, message);
  } catch (err) {
    log(`Alert send failed: ${err.message}`);
  }
}

module.exports = { startBot, sendAlert };
