const { Bot, InlineKeyboard } = require('grammy');
const logger = require('../utils/logger');
const { parseSignal } = require('./parser');
const { checkRisks } = require('./riskGate');
const { setBot, setTelegramBot } = require('./instance');
const { clearConfirmationTimeout } = require('./confirm');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../state/settings.json');
const POSITIONS_FILE = path.join(__dirname, '../state/positions.json');

class TelegramBot {
  constructor(token, allowedUsers = []) {
    this.bot = new Bot(token);
    
    // Register this bot instance so webhook can access it
    setBot(this.bot);
    setTelegramBot(this);
    
    this.allowedUsers = allowedUsers.length > 0 ? allowedUsers : null; // null = allow all
    this.proxyUrl = 'http://localhost:9009';
    this.lastSignalTime = {}; // Track recent signals for duplicate detection
    this.pendingConfirmations = new Map(); // userId -> { signal, messageId, timestamp }
    this.pendingTVConfirmations = new Map(); // 'symbol:direction' -> { signal, storedAt }
    
    if (this.allowedUsers === null) {
      logger.warn('No ALLOWED_USERS configured - bot is open to all users!');
    }
  }

  isUserAllowed(userId) {
    if (this.allowedUsers === null) return true; // Allow all if not configured
    return this.allowedUsers.includes(userId);
  }

  storeTVConfirmation(signal) {
    const key = `${signal.symbol}:${signal.direction}`;
    this.pendingTVConfirmations.set(key, {
      signal,
      storedAt: Date.now()
    });
    logger.info('Stored TradingView confirmation', { key, signal });
  }

  getTVConfirmation(symbol, direction) {
    const key = `${symbol}:${direction}`;
    const confirmation = this.pendingTVConfirmations.get(key);
    if (confirmation) {
      this.pendingTVConfirmations.delete(key);
    }
    return confirmation;
  }

  setupMiddleware() {
    // User authentication check
    this.bot.use(async (ctx, next) => {
      if (!this.isUserAllowed(ctx.from.id)) {
        logger.warn('Unauthorized access attempt', { userId: ctx.from.id });
        await ctx.reply('❌ You are not authorized to use this bot');
        return;
      }
      return next();
    });
  }

  setupCommandHandlers() {
    // Import command handlers
    const statusCmd = require('./commands/status');
    const balanceCmd = require('./commands/balance');
    const positionsCmd = require('./commands/positions');
    const pauseCmd = require('./commands/pause');
    const resumeCmd = require('./commands/resume');
    const closeallCmd = require('./commands/closeall');
    const riskCmd = require('./commands/risk');
    const symbolsCmd = require('./commands/symbols');
    const setchatidCmd = require('./commands/setchatid');
    const tvCmd = require('./commands/tv');
    const helpCmd = require('./commands/help');
    const confirmCmd = require('./commands/confirm');
    const exportCmd = require('./commands/export');
    const tpslCmd = require('./commands/tpsl');
    const minholdCmd = require('./commands/minhold');

    // Register commands
    this.bot.command('status', statusCmd(this.proxyUrl));
    this.bot.command('balance', balanceCmd(this.proxyUrl));
    this.bot.command('positions', positionsCmd(this.proxyUrl));
    this.bot.command('pause', pauseCmd());
    this.bot.command('resume', resumeCmd());
    this.bot.command('closeall', closeallCmd(this.proxyUrl));
    this.bot.command('risk', riskCmd());
    this.bot.command('symbols', symbolsCmd());
    this.bot.command('setchatid', setchatidCmd());
    this.bot.command('tv', tvCmd());
    this.bot.command('help', helpCmd());
    this.bot.command('confirm', confirmCmd());
    this.bot.command('export', exportCmd(this.proxyUrl));
    this.bot.command('tpsl', tpslCmd());
    this.bot.command('minhold', minholdCmd());
  }

  setupSignalHandler() {
    // Handle any non-command message as potential trading signal
    this.bot.on('message', async (ctx) => {
      try {
        const text = ctx.message.text;
        
        // Ignore empty or too short messages
        if (!text || text.length < 5) {
          return;
        }

        // Try to parse as trading signal
        let signal;
        try {
          const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
          signal = parseSignal(text, settings.symbolLotSizes);
        } catch (err) {
          // Not a valid signal format
          logger.info('Message not a valid signal', { text, error: err.message });
          return;
        }

        // Check risks
        const riskCheck = await checkRisks(signal, this.lastSignalTime);
        if (!riskCheck.passed) {
          await ctx.reply(`❌ ${riskCheck.reason}`);
          return;
        }

        // Show confirmation message with inline buttons
        const keyboard = new InlineKeyboard()
          .text('✅ Execute', `execute:${signal.symbol}:${signal.direction}`)
          .text('❌ Cancel', 'cancel')
          .row();

        const confirmMsg = await ctx.reply(
          `Execute?\n` +
          `${signal.direction} ${signal.volume} ${signal.symbol} @ Market\n` +
          `SL: ${signal.sl}\n` +
          `TP: ${signal.tp || 'None'}`,
          { reply_markup: keyboard }
        );

        // Store pending confirmation
        const confirmKey = `${ctx.from.id}:${signal.symbol}:${signal.direction}`;
        this.pendingConfirmations.set(confirmKey, {
          signal,
          messageId: confirmMsg.message_id,
          timestamp: Date.now(),
          userId: ctx.from.id
        });

        // Auto-cancel after 60 seconds
        setTimeout(() => {
          if (this.pendingConfirmations.has(confirmKey)) {
            this.pendingConfirmations.delete(confirmKey);
            logger.info('Confirmation expired', { confirmKey });
          }
        }, 60000);

      } catch (err) {
        logger.error('Error processing message', { error: err.message });
        ctx.reply('❌ Error processing message');
      }
    });
  }

  setupCallbackHandler() {
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const chatId = ctx.chat.id;
      const messageId = ctx.callbackQuery.message.message_id;

      if (data === 'cancel') {
        await ctx.answerCallbackQuery('Cancelled');
        await this.bot.api.editMessageText(chatId, messageId, '❌ Trade cancelled');
        return;
      }

      // Handle execute callbacks: execute:SYMBOL:DIRECTION
      const match = data.match(/^execute:(.+):(.+)$/);
      if (match) {
        try {
          const symbol = match[1];
          const direction = match[2];
          const confirmKey = `${ctx.from.id}:${symbol}:${direction}`;

          const confirmation = this.pendingConfirmations.get(confirmKey);
          if (!confirmation) {
            await ctx.answerCallbackQuery('Confirmation expired');
            return;
          }

          this.pendingConfirmations.delete(confirmKey);
          const signal = confirmation.signal;

          logger.info('Executing signal', { signal, userId: ctx.from.id });

          // Call proxy to execute trade
          const fetch = require('node-fetch');
          const response = await fetch(`${this.proxyUrl}/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: signal.symbol,
              direction: signal.direction,
              volume: signal.volume,
              sl: signal.sl,
              tp: signal.tp
            })
          });

          const result = await response.json();

          if (result.success) {
            // Update pending signals timestamp
            this.lastSignalTime[`${signal.symbol}:${signal.direction}`] = Date.now();

            // Update local positions
            const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
            positions.push({
              positionId: result.data.positionId,
              symbol: signal.symbol,
              direction: signal.direction,
              volume: signal.volume,
              sl: signal.sl,
              tp: signal.tp
            });
            fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));

            logger.info('Trade executed successfully', result.data);
            await ctx.answerCallbackQuery('✅ Trade executed');
            await this.bot.api.editMessageText(
              chatId,
              messageId,
              `✅ Executed\n` +
              `${signal.direction} ${signal.volume} ${signal.symbol}\n` +
              `Order #${result.data.orderId}`
            );
          } else {
            logger.error('Trade execution failed', { error: result.error });
            await ctx.answerCallbackQuery('❌ Execution failed');
            await this.bot.api.editMessageText(chatId, messageId, `❌ Failed: ${result.error}`);
          }
        } catch (err) {
          logger.error('Error executing callback', { error: err.message });
          await ctx.answerCallbackQuery('❌ Error executing trade');
        }
      }

      // Handle TradingView callbacks: tv_cancel:SYMBOL:DIRECTION
      const tvCancelMatch = data.match(/^tv_cancel:(.+):(.+)$/);
      if (tvCancelMatch) {
        try {
          const cancelKey = `${tvCancelMatch[1]}:${tvCancelMatch[2]}`;
          clearConfirmationTimeout(cancelKey);
          await ctx.answerCallbackQuery('Cancelled');
          await this.bot.api.editMessageText(chatId, messageId, '❌ TradingView signal cancelled by user');
          logger.info('TradingView signal cancelled', { userId: ctx.from.id, key: cancelKey });
        } catch (err) {
          logger.error('Error cancelling TradingView signal', { error: err.message });
        }
        return;
      }

      // Handle TradingView execute callbacks: tv_execute:SYMBOL:DIRECTION
      const tvMatch = data.match(/^tv_execute:(.+):(.+)$/);
      if (tvMatch) {
        try {
          const symbol = tvMatch[1];
          const direction = tvMatch[2];
          clearConfirmationTimeout(`${symbol}:${direction}`);

          logger.info('Executing TradingView signal from callback', { symbol, direction, userId: ctx.from.id });

          // Retrieve the full signal (with SL/TP) from stored confirmations
          const confirmation = this.getTVConfirmation(symbol, direction);
          if (!confirmation) {
            await ctx.answerCallbackQuery('Confirmation expired or not found');
            await this.bot.api.editMessageText(chatId, messageId, '❌ Trade confirmation expired. Please send signal again.');
            return;
          }

          const signal = confirmation.signal;
          logger.info('Retrieved signal for execution', signal);

          // Call proxy to execute trade with full signal data
          const fetch = require('node-fetch');
          const response = await fetch(`${this.proxyUrl}/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: signal.symbol,
              direction: signal.direction,
              volume: signal.volume,
              sl: signal.sl,
              tp: signal.tp
            })
          });

          const result = await response.json();

          if (result.success) {
            // Update local positions file
            const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
            positions.push({
              positionId: result.data.positionId,
              symbol: signal.symbol,
              direction: signal.direction,
              volume: signal.volume,
              sl: signal.sl,
              tp: signal.tp,
              entryPrice: result.data.openPrice
            });
            fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));

            logger.info('TradingView trade executed successfully', result.data);
            await ctx.answerCallbackQuery('✅ Trade executed');
            await this.bot.api.editMessageText(
              chatId,
              messageId,
              `✅ TradingView Trade Executed\n` +
              `${direction} ${signal.volume} ${symbol}\n` +
              `Entry: ${result.data.openPrice}\n` +
              `Order #${result.data.positionId}`
            );
          } else {
            logger.error('TradingView trade execution failed', { error: result.error });
            await ctx.answerCallbackQuery('❌ Execution failed');
            await this.bot.api.editMessageText(chatId, messageId, `❌ Execution failed: ${result.error || 'Unknown error'}`);
          }
        } catch (err) {
          logger.error('Error executing TradingView callback', { error: err.message, stack: err.stack });
          await ctx.answerCallbackQuery('❌ Error executing trade');
          try {
            await this.bot.api.editMessageText(chatId, messageId, `❌ Error: ${err.message}`);
          } catch (editErr) {
            logger.error('Failed to edit error message', { error: editErr.message });
          }
        }
      }
    });
  }

  setup() {
    this.setupMiddleware();
    this.setupCommandHandlers();
    this.setupSignalHandler();
    this.setupCallbackHandler();
  }

  async start() {
    this.setup();
    logger.info('Telegram bot started');
    await this.bot.start();
  }

  async stop() {
    await this.bot.stop();
    logger.info('Telegram bot stopped');
  }
}

module.exports = TelegramBot;
