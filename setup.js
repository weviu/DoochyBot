#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs');
const path = require('path');

let DEFAULT_SETTINGS;
try {
  DEFAULT_SETTINGS = require('./src/config').DEFAULT_SETTINGS;
} catch {
  DEFAULT_SETTINGS = {
    paused: false,
    allowedSymbols: ['BTCUSD', 'XAUUSD', 'XAGUSD'],
    lotSizes: { BTCUSD: 0.05, XAUUSD: 0.05, XAGUSD: 0.5 },
    maxPositions: 5,
    dailyLossLimitPercent: 2,
    maxDailyLossUSD: 200,
    riskMode: 'fixed',
    riskPercent: 1,
    stopLossUSD: 30,
    takeProfitUSD: 45,
    sltpMode: 'auto',
    minHoldSeconds: 60,
    confirmMode: false,
  };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

process.on('SIGINT', () => {
  console.log('\n\nSetup cancelled.');
  rl.close();
  process.exit(0);
});

function ask(question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

function maskToken(str) {
  if (!str || str.length < 10) return str;
  return str.slice(0, 4) + '...' + str.slice(-4);
}

function isJWT(str) {
  return str.split('.').length === 3;
}

async function askValidated(prompt, validate, errorMsg, maxTries = 3) {
  for (let i = 0; i < maxTries; i++) {
    const val = await ask(prompt);
    const cleaned = val.replace(/[\r\n\t]/g, '').trim();
    if (validate(cleaned)) return cleaned;
    console.log(errorMsg);
    if (i === maxTries - 1) {
      console.log('Too many invalid attempts. Setup cancelled.');
      rl.close();
      process.exit(1);
    }
  }
}

async function fetchAccounts(clientId, clientSecret, accessToken) {
  let CTraderConnection;
  try {
    CTraderConnection = require('@reiryoku/ctrader-layer').CTraderConnection;
  } catch {
    console.log('  (Dependencies not installed - skipping automatic account fetch)');
    console.log('  Run "pnpm install" first, then "pnpm run setup" again for auto-detection.');
    return null;
  }

  const conn = new CTraderConnection({ host: 'live.ctraderapi.com', port: 5035 });
  try {
    const openWithTimeout = Promise.race([
      conn.open(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    await openWithTimeout;
    await conn.sendCommand('ProtoOAApplicationAuthReq', { clientId, clientSecret });
    const res = await conn.sendCommand('ProtoOAGetAccountListByAccessTokenReq', { accessToken });
    return res.ctidTraderAccount || [];
  } catch {
    return null;
  } finally {
    try { conn.close(); } catch {}
  }
}

async function step1(data) {
  console.log('\nStep 1/5: cTrader App Credentials\n');
  console.log('These identify your application to the cTrader API.');
  console.log('Register at https://openapi.ctrader.com/apps if you haven\'t already.\n');

  data.clientId = await askValidated(
    'Client ID: ',
    v => v.length > 0 && !/\s/.test(v),
    'Client ID cannot be empty or contain spaces.'
  );

  data.clientSecret = await askValidated(
    'Client Secret: ',
    v => v.length > 0 && !/\s/.test(v),
    'Client Secret cannot be empty or contain spaces.'
  );
}

async function step2(data) {
  console.log('\nStep 2/5: Access and Refresh Tokens\n');
  console.log('These authorize the bot to trade on your account.');
  console.log('Get them from the Playground tab in your cTrader app page.');
  console.log('Select "Account info and trading" scope, then click GET TOKEN.\n');

  data.accessToken = await askValidated(
    'Access Token: ',
    v => v.length > 0,
    'Access Token cannot be empty.'
  );
  if (!isJWT(data.accessToken)) {
    console.log('Warning: this does not look like a JWT (expected format: xxx.yyy.zzz). Continuing anyway.');
  }

  data.refreshToken = await askValidated(
    'Refresh Token: ',
    v => v.length > 0,
    'Refresh Token cannot be empty.'
  );
}

async function step3(data) {
  console.log('\nStep 3/5: Account Selection\n');
  console.log('Fetching accounts linked to your token...');

  const accounts = await fetchAccounts(data.clientId, data.clientSecret, data.accessToken);

  if (accounts && accounts.length > 0) {
    console.log('\nAccounts linked to your token:\n');
    accounts.forEach((acc, i) => {
      const type = acc.isLive ? '[LIVE]' : '[demo]';
      const broker = acc.brokerName ? `  ${acc.brokerName}` : '';
      console.log(`  ${i + 1}. Login: ${acc.traderLogin}  ID: ${acc.ctidTraderAccountId}  ${type}${broker}`);
    });

    const selection = await askValidated(
      '\nEnter the number of the account to use: ',
      v => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 1 && n <= accounts.length;
      },
      `Please enter a number between 1 and ${accounts.length}.`
    );

    const chosen = accounts[parseInt(selection, 10) - 1];
    data.accountId = String(chosen.ctidTraderAccountId);
    data.host = chosen.isLive ? 'live.ctraderapi.com' : 'demo.ctraderapi.com';
  } else {
    if (accounts !== null) {
      console.log('No accounts found for this token.');
    } else {
      console.log('Could not fetch accounts automatically.');
    }
    console.log('Enter your account ID manually:\n');

    data.accountId = await askValidated(
      'Account ID: ',
      v => /^\d+$/.test(v),
      'Account ID should be a number.'
    );

    const hostChoice = await ask('Is this a live account? [yes/no]: ');
    data.host = hostChoice.toLowerCase().startsWith('y') ? 'live.ctraderapi.com' : 'demo.ctraderapi.com';
  }
}

async function step4(data) {
  console.log('\nStep 4/5: Telegram Bot\n');
  console.log('Create a bot by messaging @BotFather on Telegram:');
  console.log('  1. Send /newbot');
  console.log('  2. Choose a name (e.g., "My Trading Bot")');
  console.log('  3. Choose a username (must end with "bot")');
  console.log('  4. Copy the token @BotFather gives you\n');

  data.botToken = await askValidated(
    'Bot Token: ',
    v => v.includes(':'),
    'Bot tokens should look like 12345:ABC-DEF1234ghij'
  );

  console.log('\nYou can get your Telegram User ID by messaging @userinfobot on Telegram.');
  console.log('You can add additional users later.\n');

  const mainUser = await askValidated(
    'Your User ID: ',
    v => /^\d+$/.test(v),
    'User ID should be a number.'
  );

  const extraInput = await ask('Additional allowed user IDs (comma-separated, or press Enter to skip): ');
  const extraUsers = extraInput
    ? extraInput.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s))
    : [];

  data.allowedUsers = [mainUser, ...extraUsers].join(',');
}

async function step5(data) {
  console.log('\nStep 5/5: Signal Feed\n');
  console.log('The bot can receive trading signals from a public signal feed.');
  console.log('Default: https://signals.route07.com/rsi_alerts.json\n');

  const input = await ask('Signal feed URL (press Enter for default, or type \'none\' to disable): ');

  if (!input || input === '') {
    data.signalFeedEnabled = 'true';
    data.signalFeedUrl = 'https://signals.route07.com/rsi_alerts.json';
  } else if (input.toLowerCase() === 'none') {
    data.signalFeedEnabled = 'false';
    data.signalFeedUrl = '';
  } else {
    data.signalFeedEnabled = 'true';
    data.signalFeedUrl = input;
  }
}

function buildEnvContent(data, forDocker = false) {
  const header = forDocker
    ? '# DoochyBot Docker Configuration\n# Generated by setup.js - do not edit manually\n# Used by docker-compose.yml\n'
    : '';
  const body = [
    `CTRADER_HOST=${data.host}`,
    `CTRADER_PORT=5035`,
    `CLIENT_ID=${data.clientId}`,
    `CLIENT_SECRET=${data.clientSecret}`,
    `ACCESS_TOKEN=${data.accessToken}`,
    `REFRESH_TOKEN=${data.refreshToken}`,
    `ACCOUNT_ID=${data.accountId}`,
    `TELEGRAM_BOT_TOKEN=${data.botToken}`,
    `ALLOWED_USERS=${data.allowedUsers}`,
    `SIGNAL_FEED_ENABLED=${data.signalFeedEnabled}`,
    `SIGNAL_FEED_URL=${data.signalFeedUrl}`,
  ].join('\n') + '\n';
  return header + body;
}

async function writeFileWithPrompt(filePath, content) {
  if (fs.existsSync(filePath)) {
    const overwrite = await ask(`${filePath} already exists. Overwrite? [yes/no]: `);
    if (!overwrite.toLowerCase().startsWith('y')) {
      console.log(`Skipped ${filePath}`);
      return;
    }
  }
  try {
    fs.writeFileSync(filePath, content);
    console.log(`Written: ${filePath}`);
  } catch (err) {
    console.log(`Failed to write ${filePath}: ${err.message}`);
    if (err.code === 'EACCES') console.log('Suggestion: check file permissions or run with appropriate access.');
    if (err.code === 'ENOSPC') console.log('Suggestion: free up disk space and try again.');
  }
}

async function main() {
  console.log('============================================');
  console.log('       DoochyBot - Trading Bot Setup');
  console.log('============================================');
  console.log('\nTip: Run "pnpm install" before setup for automatic account detection.\n');
  console.log('This wizard will configure your bot to trade on cTrader.');
  console.log('You\'ll need:');
  console.log('  - cTrader Open API credentials (from openapi.ctrader.com/apps)');
  console.log('  - Access and Refresh tokens (from the Playground tab in your app)');
  console.log('  - A Telegram bot token (from @BotFather)');

  await ask('\nPress Enter to continue...');

  const data = {};

  await step1(data);
  await step2(data);
  await step3(data);
  await step4(data);
  await step5(data);

  console.log('\n============================================');
  console.log('Configuration Summary');
  console.log('============================================\n');
  console.log('cTrader:');
  console.log(`  Host:      ${data.host}`);
  console.log(`  Account:   ${data.accountId}`);
  console.log(`  Client ID: ${data.clientId}`);
  console.log(`  Tokens:    **** (set)`);
  console.log('\nTelegram:');
  console.log(`  Bot Token: ${maskToken(data.botToken)}`);
  console.log(`  Allowed:   ${data.allowedUsers}`);
  console.log('\nSignal Feed:');
  console.log(`  Enabled:   ${data.signalFeedEnabled}`);
  console.log(`  URL:       ${data.signalFeedUrl || '(disabled)'}`);
  console.log('\n============================================');

  const confirm = await ask('Does this look correct? [yes/no]: ');
  if (!confirm.toLowerCase().startsWith('y')) {
    console.log("Setup cancelled. Run 'pnpm run setup' to try again.");
    rl.close();
    return;
  }

  console.log('');
  const rootDir = path.join(__dirname);

  await writeFileWithPrompt(path.join(rootDir, '.env'), buildEnvContent(data));
  await writeFileWithPrompt(path.join(rootDir, '.env.docker'), buildEnvContent(data, true));

  const dataDir = path.join(rootDir, 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const settingsPath = path.join(dataDir, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const overwrite = await ask('data/settings.json already exists. Overwrite? [yes/no]: ');
      if (overwrite.toLowerCase().startsWith('y')) {
        fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
        console.log('Written: data/settings.json');
      } else {
        console.log('Skipped data/settings.json');
      }
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      console.log('Written: data/settings.json');
    }
  } catch (err) {
    console.log(`Failed to write data/settings.json: ${err.message}`);
  }

  console.log('\nSetup complete!');
  console.log('\nNext steps:');
  console.log('  1. Run: pnpm start');
  console.log('  2. Your bot will connect to cTrader and start monitoring for signals');
  console.log('  3. Send /start to your bot on Telegram');
  console.log('  4. Send /help to see all commands');
  console.log('\nHappy trading!');

  rl.close();
}

main().catch(err => {
  console.error(`Setup error: ${err.message}`);
  rl.close();
  process.exit(1);
});
