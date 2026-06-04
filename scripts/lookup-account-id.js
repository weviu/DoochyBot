require('dotenv').config();
const { CTraderConnection } = require('@reiryoku/ctrader-layer');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

function updateEnvFile(filePath, newId) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.replace(/^ACCOUNT_ID=.*/m, `ACCOUNT_ID=${newId}`);
  fs.writeFileSync(filePath, updated);
  return true;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function lookup() {
  const conn = new CTraderConnection({
    host: process.env.CTRADER_HOST || 'live.ctraderapi.com',
    port: parseInt(process.env.CTRADER_PORT) || 5035
  });

  await conn.open();
  console.log('Connected');

  await conn.sendCommand('ProtoOAApplicationAuthReq', {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
  });
  console.log('App authenticated');

  const res = await conn.sendCommand('ProtoOAGetAccountListByAccessTokenReq', {
    accessToken: process.env.ACCESS_TOKEN
  });

  const descriptor = res.descriptor || res;
  const accounts = descriptor.ctidTraderAccount || [];

  console.log('\n=== Accounts linked to this access token ===');
  accounts.forEach(acc => {
    const current = String(acc.ctidTraderAccountId) === String(process.env.ACCOUNT_ID) ? ' <-- current' : '';
    console.log(`  Display ID: ${acc.traderLogin}  |  Internal ID: ${acc.ctidTraderAccountId}  |  Live: ${acc.isLive}${current}`);
  });

  conn.close();

  const answer = await prompt('\nEnter Internal ID to set as ACCOUNT_ID (or Enter to skip): ');
  if (!answer) {
    console.log('No change made.');
    return;
  }

  const match = accounts.find(a => String(a.ctidTraderAccountId) === answer);
  if (!match) {
    console.error(`ID ${answer} not found in the list above. No change made.`);
    process.exit(1);
  }

  const envPath = path.join(__dirname, '.env');
  const envDockerPath = path.join(__dirname, '.env.docker');

  const updatedEnv = updateEnvFile(envPath, answer);
  const updatedDocker = updateEnvFile(envDockerPath, answer);

  if (updatedEnv) console.log(`Updated .env → ACCOUNT_ID=${answer}`);
  if (updatedDocker) console.log(`Updated .env.docker → ACCOUNT_ID=${answer}`);
  if (!updatedEnv && !updatedDocker) console.log('No .env files found to update.');
}

lookup().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
