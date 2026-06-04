const { CTraderConnection } = require('@reiryoku/ctrader-layer');
require('dotenv').config();

async function main() {
  const conn = new CTraderConnection({
    host: process.env.CTRADER_HOST || 'live.ctraderapi.com',
    port: parseInt(process.env.CTRADER_PORT || 5035),
  });

  await conn.open();
  console.log('Connected');

  await conn.sendCommand('ProtoOAApplicationAuthReq', {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  });
  console.log('App authenticated');

  await conn.sendCommand('ProtoOAAccountAuthReq', {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
    accessToken: process.env.ACCESS_TOKEN,
  });
  console.log('Account authenticated');

  const result = await conn.sendCommand('ProtoOASymbolsListReq', {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
  });

  console.log('\n=== FULL CTRADER SYMBOL LIST ===\n');
  
  if (result && result.symbols) {
    result.symbols.forEach(s => {
      console.log(`${s.symbolName || s.name || 'UNKNOWN'} | ID: ${s.symbolId} | LotSize: ${s.lotSize || 'N/A'}`);
    });
    console.log(`\nTotal: ${result.symbols.length} symbols`);
  } else {
    console.log('Raw result:', JSON.stringify(result, null, 2));
  }

  await conn.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
