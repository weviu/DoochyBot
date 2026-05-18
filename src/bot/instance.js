let botInstance = null;
let telegramBotInstance = null;

function setBot(bot) {
  botInstance = bot;
}

function getBot() {
  if (!botInstance) {
    throw new Error('Telegram bot instance not initialized. Call setBot() first.');
  }
  return botInstance;
}

function setTelegramBot(telegramBot) {
  telegramBotInstance = telegramBot;
}

function getTelegramBot() {
  if (!telegramBotInstance) {
    throw new Error('TelegramBot instance not initialized. Call setTelegramBot() first.');
  }
  return telegramBotInstance;
}

module.exports = {
  setBot,
  getBot,
  setTelegramBot,
  getTelegramBot
};
