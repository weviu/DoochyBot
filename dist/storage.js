"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSettings = loadSettings;
exports.saveSettings = saveSettings;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), "data");
const SETTINGS_FILE = path_1.default.join(DATA_DIR, "settings.json");
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadSettings() {
    try {
        ensureDataDir();
        if (fs_1.default.existsSync(SETTINGS_FILE)) {
            const raw = fs_1.default.readFileSync(SETTINGS_FILE, "utf-8");
            return JSON.parse(raw);
        }
    }
    catch (err) {
        console.warn(`[STORAGE] Could not load settings: ${err.message}`);
    }
    return null;
}
function saveSettings(settings) {
    try {
        ensureDataDir();
        fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
        console.log("[STORAGE] Settings saved");
    }
    catch (err) {
        console.warn(`[STORAGE] Could not save settings: ${err.message}`);
    }
}
//# sourceMappingURL=storage.js.map