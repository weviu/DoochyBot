const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../data');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

// Ensure data directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function maskSensitive(msg) {
  // Mask tokens and secrets
  return msg
    .replace(/token[:\s]*[a-zA-Z0-9_-]+/gi, 'token: ***MASKED***')
    .replace(/secret[:\s]*[a-zA-Z0-9_-]+/gi, 'secret: ***MASKED***')
    .replace(/key[:\s]*[a-zA-Z0-9_-]+/gi, 'key: ***MASKED***')
    .replace(/access_token[:\s]*[a-zA-Z0-9._-]+/gi, 'access_token: ***MASKED***')
    .replace(/refresh_token[:\s]*[a-zA-Z0-9._-]+/gi, 'refresh_token: ***MASKED***');
}

function log(level, message, data = null) {
  const timestamp = formatTimestamp();
  const maskedMsg = maskSensitive(message);
  const logEntry = `[${timestamp}] [${level}] ${maskedMsg}${data ? ' ' + JSON.stringify(data) : ''}`;
  
  // Log to console
  console.log(logEntry);
  
  // Log to file
  try {
    fs.appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

module.exports = {
  info: (msg, data) => log(LEVELS.INFO, msg, data),
  warn: (msg, data) => log(LEVELS.WARN, msg, data),
  error: (msg, data) => log(LEVELS.ERROR, msg, data)
};
