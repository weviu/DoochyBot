const logger = require('../utils/logger');
const { getBot, getTelegramBot } = require('./instance');
const fs = require('fs');
const path = require('path');
const { InlineKeyboard } = require('grammy');

const SETTINGS_FILE = path.join(__dirname, '../state/settings.json');
const POSITIONS_FILE = path.join(__dirname, '../state/positions.json');

const activeTimeouts = new Map();

/**
 * Send TradingView signal confirmation to user via Telegram
 * Signal: { direction, symbol, sl, tp, volume, entryPrice? }
 */
async function sendConfirmation(signal) {
  try {
    const bot = getBot();
    const telegramBot = getTelegramBot();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    
    if (!settings.chatId) {
      logger.error('No chatId configured - cannot send confirmation', { signal });
      throw new Error('chatId not set. User must run /setchatid first.');
    }

    const chatId = parseInt(settings.chatId);

    const confirmText =
      `📊 TradingView Signal\n` +
      `${signal.direction} ${signal.volume} ${signal.symbol} @ Market\n` +
      `SL: ${signal.sl}\n` +
      `TP: ${signal.tp || 'None'}`;

    const key = `${signal.symbol}:${signal.direction}`;

    const keyboard = new InlineKeyboard()
      .text('✅ Execute', `tv_execute:${signal.symbol}:${signal.direction}`)
      .text('❌ Cancel', `tv_cancel:${signal.symbol}:${signal.direction}`)
      .row();

    const confirmMsg = await bot.api.sendMessage(chatId, confirmText, {
      reply_markup: keyboard
    });

    logger.info('TradingView confirmation sent', {
      signal,
      messageId: confirmMsg.message_id,
      chatId
    });

    // Store signal in TelegramBot instance so callback handler can retrieve it
    telegramBot.storeTVConfirmation(signal);

    // Auto-cancel after 60 seconds with message edit
    const timeoutId = setTimeout(async () => {
      activeTimeouts.delete(key);
      try {
        logger.info('TradingView confirmation timeout - attempting to edit message', {
          messageId: confirmMsg.message_id,
          chatId
        });

        // Try to edit the message to show it expired (remove buttons)
        await bot.api.editMessageText(chatId, confirmMsg.message_id, {
          text: `⏱️ Signal confirmation expired (120s timeout).\n\n${confirmText}`
        });
        logger.info('Edited expired confirmation message');
      } catch (editErr) {
        // Message may already be edited or deleted - this is OK
        logger.debug('Could not edit expired message (may already be edited)', {
          error: editErr.message
        });
      }
    }, 120000);
    activeTimeouts.set(key, timeoutId);

    return confirmMsg.message_id;
  } catch (err) {
    logger.error('Failed to send confirmation', { error: err.message });
    throw err;
  }
}

/**
 * Store pending TradingView confirmation for button handler
 * Called from webhook after signal is confirmed by user
 */
async function executeTradingViewTrade(signal, meta = null) {
  try {
    logger.info('Executing TradingView trade', signal);

    const fetch = require('node-fetch');
    const body = {
      symbol: signal.symbol,
      direction: signal.direction,
      volume: signal.volume,
      sl: signal.sl,
      tp: signal.tp
    };
    if (meta) body.meta = meta;

    const response = await fetch('http://localhost:9009/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.success) {
      // Update local positions
      const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
      positions.push({
        positionId: result.data.positionId,
        symbol: signal.symbol,
        direction: signal.direction,
        volume: signal.volume,
        sl: signal.sl,
        tp: signal.tp,
        entryPrice: signal.entryPrice
      });
      fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));

      logger.info('TradingView trade executed', result.data);
      return { success: true, data: result.data };
    } else {
      logger.error('TradingView trade failed', { error: result.error });
      return { success: false, error: result.error };
    }
  } catch (err) {
    logger.error('Error executing TradingView trade', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function sendAlert(signal, result) {
  try {
    const bot = getBot();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (!settings.chatId) return;
    const chatId = parseInt(settings.chatId);

    if (result.success) {
      await bot.api.sendMessage(chatId,
        `⚡️ Auto executed Signal\n` +
        `${signal.direction} ${signal.symbol}\n` +
        `Entry: ${result.data.openPrice || 'Market'}\n` +
        `TP: ${signal.tp || 'None'}\n` +
        `SL: ${signal.sl}\n` +
        `Order #${result.data.positionId}`
      );
    } else {
      await bot.api.sendMessage(chatId,
        `❌ Auto-execute failed\n` +
        `${signal.direction} ${signal.symbol}\n` +
        `Error: ${result.error}`
      );
    }
  } catch (err) {
    logger.error('Failed to send alert', { error: err.message });
  }
}

async function sendReversalAlert(signal, closedPositions, result) {
  try {
    const bot = getBot();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (!settings.chatId) return;
    const chatId = parseInt(settings.chatId);

    const closedLines = closedPositions.map(pos => {
      const price = pos.entryPrice ? ` @ ${pos.entryPrice}` : '';
      return `🔄 Reversal: Closed ${pos.direction} ${pos.symbol}${price}`;
    }).join('\n');

    if (result.success) {
      await bot.api.sendMessage(chatId,
        `${closedLines}\n` +
        `⚡️ Auto-executing ${signal.direction} ${signal.symbol} @ ${result.data.openPrice || 'Market'}\n` +
        `SL: ${signal.sl} | TP: ${signal.tp || 'None'}`
      );
    } else {
      await bot.api.sendMessage(chatId,
        `${closedLines}\n` +
        `❌ Reversal open failed: ${result.error}`
      );
    }
  } catch (err) {
    logger.error('Failed to send reversal alert', { error: err.message });
  }
}

async function sendReversalRejected(signal, reason) {
  try {
    const bot = getBot();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (!settings.chatId) return;
    const chatId = parseInt(settings.chatId);

    await bot.api.sendMessage(chatId,
      `🚫 Reversal blocked: ${signal.symbol} ${signal.direction}\n` +
      `Reason: ${reason}`
    );
  } catch (err) {
    logger.error('Failed to send reversal rejected message', { error: err.message });
  }
}

function clearConfirmationTimeout(key) {
  if (activeTimeouts.has(key)) {
    clearTimeout(activeTimeouts.get(key));
    activeTimeouts.delete(key);
  }
}

module.exports = {
  sendConfirmation,
  sendAlert,
  sendReversalAlert,
  sendReversalRejected,
  executeTradingViewTrade,
  clearConfirmationTimeout
};
