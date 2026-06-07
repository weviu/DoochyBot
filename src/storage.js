const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('./config');
const state = require('./state');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TRADE_LOG_FILE = path.join(DATA_DIR, 'tradeLog.jsonl');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSettings() {
  ensureDataDir();
  let settings;
  if (!fs.existsSync(SETTINGS_FILE)) {
    settings = { ...DEFAULT_SETTINGS };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } else {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const loaded = JSON.parse(raw);
    settings = { ...DEFAULT_SETTINGS, ...loaded };
  }
  state.settings = settings;
  return settings;
}

function saveSettings(updates) {
  const before = JSON.stringify(state.settings);
  Object.assign(state.settings, updates);
  const after = JSON.stringify(state.settings);
  if (before === after) return;
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(state.settings, null, 2));
}

function appendTrade(record) {
  ensureDataDir();
  fs.appendFileSync(TRADE_LOG_FILE, JSON.stringify(record) + '\n');
}

module.exports = { loadSettings, saveSettings, appendTrade };
