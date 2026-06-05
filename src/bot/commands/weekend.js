const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../state/settings.json');
const PROFILES_FILE = path.join(__dirname, '../../state/profiles.json');

module.exports = () => {
  return async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const sub = args[0]?.toLowerCase();

      if (!['on', 'off'].includes(sub)) {
        await ctx.reply('Usage: /weekend on|off');
        return;
      }

      const enabled = sub === 'on';
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      settings.weekendTrading = enabled;

      // Keep active profile in sync
      const activeProfile = settings.activeProfile;
      if (activeProfile && activeProfile !== 'custom') {
        try {
          const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
          if (profiles[activeProfile]) {
            profiles[activeProfile].weekendTrading = enabled;
            fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
          }
        } catch (err) {
          logger.warn('Could not sync weekend setting to active profile', { error: err.message });
        }
      }

      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

      if (enabled) {
        await ctx.reply('Weekend trading ENABLED. Risk gate will allow trades on Saturday/Sunday.');
      } else {
        await ctx.reply('Weekend trading DISABLED. Signals on weekends will be rejected.');
      }
      logger.info('Weekend trading updated', { enabled });

    } catch (err) {
      logger.error('Weekend command error', { error: err.message });
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  };
};
