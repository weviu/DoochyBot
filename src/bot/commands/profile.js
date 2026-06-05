const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');
const PROFILES_FILE = path.join(__dirname, '../../state/profiles.json');

function loadProfiles() {
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
  } catch (err) {
    return {};
  }
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);

      if (args.length < 1) {
        await ctx.reply(
          `Usage:\n` +
          `/profile <firm> — Switch to a preset profile\n` +
          `/profile list — Show all profiles\n` +
          `/profile save <name> — Save current settings as profile\n` +
          `/profile delete <name> — Delete a profile`
        );
        return;
      }

      const sub = args[0].toLowerCase();
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      const profiles = loadProfiles();

      if (sub === 'list') {
        if (Object.keys(profiles).length === 0) {
          await ctx.reply('No profiles saved. Use /profile save <name> to create one.');
          return;
        }
        const active = settings.activeProfile ?? 'custom';
        const lines = Object.entries(profiles).map(([name, p]) => {
          const weekends = p.weekendTrading ? 'ON' : 'OFF';
          const marker = name === active ? ' ← CURRENT' : '';
          return `🔹 ${name} — Daily: ${p.dailyLossLimit}% | Risk: ${p.riskPercent}% | Max pos: ${p.maxPositions} | Weekends: ${weekends}${marker}`;
        });
        await ctx.reply(`Available profiles:\n${lines.join('\n')}`);
        return;
      }

      if (sub === 'save') {
        const name = args[1]?.toLowerCase();
        if (!name) {
          await ctx.reply('Usage: /profile save <name>');
          return;
        }
        const profile = {
          dailyLossLimit: settings.dailyLossLimit ?? 5,
          riskPercent: settings.riskPercent ?? 1.0,
          maxPositions: settings.maxPositions ?? 5,
          maxTotalExposure: settings.maxTotalExposure ?? 1.0,
          weekendTrading: settings.weekendTrading ?? false
        };
        profiles[name] = profile;
        saveProfiles(profiles);
        await ctx.reply(`Profile '${name}' saved. Use /profile ${name} to switch to it.`);
        logger.info('Profile saved', { name, profile });
        return;
      }

      if (sub === 'delete') {
        const name = args[1]?.toLowerCase();
        if (!name) {
          await ctx.reply('Usage: /profile delete <name>');
          return;
        }
        const active = settings.activeProfile ?? 'custom';
        if (name === active) {
          await ctx.reply(`❌ Cannot delete the currently active profile '${name}'.`);
          return;
        }
        if (!profiles[name]) {
          await ctx.reply(`❌ Profile '${name}' not found.`);
          return;
        }
        delete profiles[name];
        saveProfiles(profiles);
        await ctx.reply(`Profile '${name}' deleted.`);
        logger.info('Profile deleted', { name });
        return;
      }

      // /profile <firm> — switch to profile
      const firmName = sub;
      if (!profiles[firmName]) {
        const available = Object.keys(profiles).join(', ') || 'none';
        await ctx.reply(`❌ Profile '${firmName}' not found.\nAvailable: ${available}`);
        return;
      }

      const p = profiles[firmName];
      settings.dailyLossLimit = p.dailyLossLimit;
      settings.riskPercent = p.riskPercent;
      settings.maxPositions = p.maxPositions;
      settings.maxTotalExposure = p.maxTotalExposure;
      settings.weekendTrading = p.weekendTrading;
      settings.activeProfile = firmName;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      const display = firmName.charAt(0).toUpperCase() + firmName.slice(1);
      await ctx.reply(
        `Switched to ${display} profile.\n` +
        `📊 Daily loss limit: ${p.dailyLossLimit}%\n` +
        `💰 Risk per trade: ${p.riskPercent}%\n` +
        `📈 Max positions: ${p.maxPositions}\n` +
        `📅 Weekend trading: ${p.weekendTrading ? 'ENABLED' : 'DISABLED'}`
      );
      logger.info('Profile switched', { profile: firmName });

    } catch (err) {
      logger.error('Profile command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
