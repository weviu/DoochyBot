const { CTraderConnection } = require('@reiryoku/ctrader-layer');
require('dotenv').config();

async function main() {
  const conn = new CTraderConnection({
    host: process.env.CTRADER_HOST || 'live.ctraderapi.com',
    port: parseInt(process.env.CTRADER_PORT || 5035),
  });

  await conn.open();
  await conn.sendCommand('ProtoOAApplicationAuthReq', {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  });
  await conn.sendCommand('ProtoOAAccountAuthReq', {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
    accessToken: process.env.ACCESS_TOKEN,
  });

  // Get all symbols
  const list = await conn.sendCommand('ProtoOASymbolsListReq', {
    ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
  });

  const cryptoSymbols = [324,323,316,317,318,319,320,321,322,335,284,291,292,294,295,296,297,298,299,300,302,303,304,305,306,307,309,310,311,312,336];
  
  console.log('\n=== LOT SIZES FOR CRYPTO SYMBOLS ===\n');
  
  for (const id of cryptoSymbols) {
    try {
      const info = await conn.sendCommand('ProtoOASymbolByIdReq', {
        ctidTraderAccountId: parseInt(process.env.ACCOUNT_ID),
        symbolId: [id],
      });
      const s = info.symbol?.[0] || info.symbols?.[0];
      if (s) {
        console.log(`${s.symbolName} | ID: ${s.symbolId} | LotSize: ${s.lotSize || 'N/A'} | MinVol: ${s.minVolume || 'N/A'} | StepVol: ${s.stepVolume || 'N/A'}`);
      }
    } catch (e) {
      console.log(`ID ${id}: Failed - ${e.message}`);
    }
  }

  await conn.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
