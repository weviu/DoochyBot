require('dotenv').config();

const { Bot } = require('grammy');
const logger = require('./src/utils/logger');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Simple echo test
bot.command('test', async (ctx) => {
  await ctx.reply('✅ Bot is working!');
  logger.info('Test command executed');
});

bot.command('ping', async (ctx) => {
  await ctx.reply('🏓 Pong!');
});

bot.on('message', async (ctx) => {
  const text = ctx.message.text;
  logger.info('Message received', { text });
  
  // Test signal parsing without risk checks
  try {
    const { parseSignal } = require('./src/bot/parser');
    const settings = {
      symbolLotSizes: {
        BTCUSD: 0.01,
        XAUUSD: 0.05,
        XAGUSD: 0.1
      }
    };
    
    const signal = parseSignal(text, settings.symbolLotSizes);
    await ctx.reply(`✅ Signal parsed:\n${JSON.stringify(signal, null, 2)}`);
    logger.info('Signal parsed successfully', signal);
  } catch (err) {
    logger.info('Not a valid signal', { error: err.message });
  }
});

// Graceful error handling
bot.catch((err) => {
  logger.error('Bot error', { error: err.message });
});

// Use polling with proper configuration
bot.start({
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true
}).catch(err => {
  logger.error('Failed to start bot', { error: err.message });
  process.exit(1);
});

logger.info('Test bot started - send /test or /ping');
