#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
};

const print = (msg = '') => process.stdout.write(msg + '\n');
const header = msg => print(`\n${c.bold}${c.cyan}── ${msg} ${'─'.repeat(Math.max(0, 44 - msg.length))}${c.reset}`);
const ok     = msg => print(`${c.green}✓${c.reset}  ${msg}`);
const warn   = msg => print(`${c.yellow}!${c.reset}  ${msg}`);
const info   = msg => print(`   ${c.dim}${msg}${c.reset}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultVal = '') {
  return new Promise(resolve => {
    const hint = defaultVal ? ` ${c.dim}[${defaultVal}]${c.reset}` : '';
    rl.question(`${question}${hint}: `, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function fetchAccounts(clientId, clientSecret, accessToken) {
  const conn = new CTraderConnection({ host: 'live.ctraderapi.com', port: 5035 });
  await conn.open();
  try {
    await conn.sendCommand('ProtoOAApplicationAuthReq', { clientId, clientSecret });
    const res = await conn.sendCommand('ProtoOAGetAccountListByAccessTokenReq', { accessToken });
    return res.ctidTraderAccount || [];
  } finally {
    conn.close();
  }
}

async function main() {
  print(`\n${c.bold}╔═══════════════════════════════════════╗`);
  print(`║         DoochyBot Setup Wizard        ║`);
  print(`╚═══════════════════════════════════════╝${c.reset}`);
  print();
  print('Creates .env and .env.docker, then resets trading state.');
  print(`Press ${c.bold}Enter${c.reset} to accept a default shown in [brackets].`);

  // ── Step 1: cTrader App Credentials ───────────────────────────────────────
  header('Step 1 — cTrader App Credentials');
  info('Go to openapi.ctrader.com/apps and open (or create) your app.');
  info('Copy the Client ID and Client Secret from the app detail page.');
  print();

  const clientId     = await ask('Client ID');
  const clientSecret = await ask('Client Secret');

  // ── Step 2: Access Tokens ──────────────────────────────────────────────────
  header('Step 2 — Access & Refresh Tokens');
  info('In your app page click "Playground" → authorize → copy the tokens.');
  info('Sandbox tokens work for demo accounts; live tokens for real/prop accounts.');
  print();

  const accessToken  = await ask('Access Token');
  const refreshToken = await ask('Refresh Token');

  // ── Step 3: Account & API Host ─────────────────────────────────────────────
  header('Step 3 — cTrader Account');
  info('Looking up accounts linked to your access token...');
  print();

  let accountId = '';
  let host      = 'live.ctraderapi.com';

  try {
    const accounts = await fetchAccounts(clientId, clientSecret, accessToken);
    if (accounts.length === 0) {
      warn('No accounts found for this token. Enter account details manually.');
    } else {
      print(`   Found ${accounts.length} account${accounts.length > 1 ? 's' : ''}:\n`);
      accounts.forEach((a, i) => {
        const type = a.isLive ? `${c.green}LIVE${c.reset}` : `${c.dim}demo${c.reset}`;
        print(`   ${c.bold}${i + 1}.${c.reset} Login: ${c.bold}${a.traderLogin || '?'}${c.reset}  ID: ${a.ctidTraderAccountId}  [${type}]  ${a.brokerName || ''}`);
      });
      print();
      warn('FTMO/prop firm evaluation accounts show as LIVE.');
      warn('Pick the LIVE account for prop firm trading.');
      print();

      const choice = await ask(`Select account number (1-${accounts.length})`, '1');
      const idx = Math.max(0, Math.min(parseInt(choice) - 1, accounts.length - 1));
      const picked = accounts[idx];
      accountId = String(picked.ctidTraderAccountId);
      host      = picked.isLive ? 'live.ctraderapi.com' : 'demo.ctraderapi.com';
      ok(`Selected: ${picked.traderLogin || accountId} (${picked.isLive ? 'live' : 'demo'})`);
    }
  } catch (err) {
    warn(`Could not fetch accounts: ${err.message}`);
    warn('Enter account details manually.');
  }

  if (!accountId) {
    warn('Prop firm accounts (FTMO, MyForexFunds…) must use live.ctraderapi.com');
    warn('Standard demo accounts use demo.ctraderapi.com');
    print();
    accountId = await ask('Account ID (ctidTraderAccountId)');
    host      = await ask('cTrader API host', 'live.ctraderapi.com');
  }

  // ── Step 4: Server Address (only needed for TradingView webhook) ──────────
  header('Step 4 — Server Address (optional)');
  info('Only needed if using TradingView webhook alerts.');
  info('If using the signal feed only, press Enter to skip.');
  print();

  const serverHost = await ask('Server IP or domain (leave blank to skip)', '');
  const proxyPort  = await ask('Proxy port', '9009');

  // ── Step 5: Telegram ───────────────────────────────────────────────────────
  header('Step 5 — Telegram Bot');
  info('Create a bot via @BotFather on Telegram to get a token.');
  info('Your Telegram user ID: message @userinfobot or @RawDataBot.');
  print();

  const telegramToken = await ask('Telegram Bot Token');
  const allowedUsers  = await ask('Allowed Telegram user IDs (comma-separated)');

  // ── Step 6: Signal Feed ────────────────────────────────────────────────────
  header('Step 6 — Signal Feed (optional)');
  info('If using a JSON signal feed (e.g. signals.route07.com), enter the URL.');
  info('Leave blank to skip — you can enable it later by editing .env.');
  print();

  const feedUrl = await ask('Signal feed URL (leave blank to skip)', '');

  // ── Write .env files ───────────────────────────────────────────────────────
  header('Writing configuration');

  const today = new Date().toISOString().slice(0, 10);
  const envContent = [
    `# DoochyBot — generated by setup wizard on ${today}`,
    '',
    '# cTrader API',
    `CTRADER_HOST=${host}`,
    `CTRADER_PORT=5035`,
    `CLIENT_ID=${clientId}`,
    `CLIENT_SECRET=${clientSecret}`,
    `ACCESS_TOKEN=${accessToken}`,
    `REFRESH_TOKEN=${refreshToken}`,
    `ACCOUNT_ID=${accountId}`,
    '',
    '# Proxy',
    `PROXY_PORT=${proxyPort}`,
    '',
    '# Telegram',
    `TELEGRAM_BOT_TOKEN=${telegramToken}`,
    `ALLOWED_USERS=${allowedUsers}`,
    '',
    '# Signal feed',
    `SIGNAL_FEED_ENABLED=${feedUrl ? 'true' : 'false'}`,
    `SIGNAL_FEED_URL=${feedUrl}`,
    '',
  ].join('\n');

  const root = __dirname;
  fs.writeFileSync(path.join(root, '.env'), envContent);
  fs.writeFileSync(path.join(root, '.env.docker'), envContent);
  ok('.env written');
  ok('.env.docker written');

  // ── Reset state files ──────────────────────────────────────────────────────
  header('Resetting trading state');

  const stateDir = path.join(root, 'src/state');
  const resets = {
    'dailyState.json': JSON.stringify({ date: today, realizedPnL: 0, tradingLocked: false, dailyStopLosses: 0 }, null, 2),
    'positions.json':  '[]',
    'tradeLog.json':   '[]',
  };

  for (const [file, content] of Object.entries(resets)) {
    fs.writeFileSync(path.join(stateDir, file), content);
    ok(`${file} reset`);
  }

  // ── Next Steps ─────────────────────────────────────────────────────────────
  const webhookUrl = `http://${serverHost || 'YOUR_IP'}:${proxyPort}/webhook`;

  print();
  print(`${c.bold}${c.green}════════════════════════════════════════${c.reset}`);
  print(`${c.bold}${c.green}  Setup complete — what to do next:${c.reset}`);
  print(`${c.bold}${c.green}════════════════════════════════════════${c.reset}`);
  print();

  print(`${c.bold}1. Start the bot (Docker — recommended):${c.reset}`);
  print(`     docker-compose up -d --build`);
  print(`     docker-compose logs -f trading-bot`);
  print();

  print(`${c.bold}   OR start with npm:${c.reset}`);
  print(`     npm start`);
  print();

  print(`${c.bold}2. Add trading symbols in Telegram:${c.reset}`);
  print(`     /symbols add EURUSD 0.01`);
  print(`     /symbols add all          ← adds every known symbol at 0.01 lot`);
  print();

  if (feedUrl) {
    print(`${c.bold}3. Set your webhook in the signal feed UI:${c.reset}`);
    print(`     ${webhookUrl}`);
    print();
  } else {
    print(`${c.bold}3. Point TradingView alerts to:${c.reset}`);
    print(`     ${webhookUrl}`);
    print();
  }

  print(`${c.bold}4. If using Docker and hitting permission errors:${c.reset}`);
  print(`     chmod 666 src/state/*.json && chmod 777 src/state/`);
  print();

  rl.close();
}

main().catch(err => {
  console.error(`\n${c.red}Setup failed:${c.reset}`, err.message);
  rl.close();
  process.exit(1);
});
