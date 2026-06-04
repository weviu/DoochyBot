require('dotenv').config();
const { CTraderConnection } = require('@reiryoku/ctrader-layer');

async function lookup() {
  const conn = new CTraderConnection({
    host: process.env.CTRADER_HOST || 'live.ctraderapi.com',
    port: parseInt(process.env.CTRADER_PORT) || 5035
  });

  await conn.open();
  await conn.sendCommand('ProtoOAApplicationAuthReq', {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
  });
  await conn.sendCommand('ProtoOAAccountAuthReq', {
    accessToken: process.env.ACCESS_TOKEN,
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID)
  });

  const res = await conn.sendCommand('ProtoOASymbolsListReq', {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
    includeArchivedSymbols: false
  });

  const descriptor = res.descriptor || res;
  const symbols = descriptor.symbol || [];

  const targets = ['BTC', 'ETH', 'EUR', 'GBP', 'GOLD', 'XAU', 'OIL', 'NAS', 'US30', 'SP5'];
  console.log('\n=== Symbols matching common targets ===');
  symbols
    .filter(s => targets.some(t => (s.name || '').toUpperCase().includes(t)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .forEach(s => console.log(`  id: ${s.symbolId}  name: ${s.name}`));

  conn.close();
}

lookup().catch(err => {
  console.error('Error:', err.message || JSON.stringify(err));
  process.exit(1);
});
