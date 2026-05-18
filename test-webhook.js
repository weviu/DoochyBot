#!/usr/bin/env node

/**
 * TradingView Webhook Tester
 * 
 * Simulates TradingView sending trading signals to the webhook
 * 
 * Usage:
 *   node test-webhook.js BUY BTCUSD SL=65000 TP=67000
 *   node test-webhook.js SELL XAUUSD SL=2050
 */

const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('TradingView Webhook Tester\n');
  console.log('Usage: node test-webhook.js <signal>\n');
  console.log('Examples:');
  console.log('  node test-webhook.js "BUY BTCUSD SL=65000 TP=67000"');
  console.log('  node test-webhook.js "SELL XAUUSD SL=2050"');
  console.log('  node test-webhook.js "LONG EURUSD SL=1.0800 TP=1.1000"');
  process.exit(0);
}

const signal = args.join(' ');

const options = {
  hostname: 'localhost',
  port: 9009,
  path: '/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(signal)
  }
};

console.log('📤 Sending webhook signal...');
console.log(`   Signal: "${signal}"`);
console.log(`   Target: http://localhost:9009/webhook`);
console.log();

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📥 Response (${res.statusCode}):`);
    console.log('   ' + data);
    console.log();

    if (res.statusCode === 200) {
      console.log('✅ Signal sent successfully!');
      console.log('   Check Telegram for confirmation message');
      console.log('   Click ✅ Execute or ❌ Cancel to proceed');
    } else {
      console.log('❌ Error sending signal');
    }

    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (err) => {
  console.error('❌ Connection failed:', err.message);
  console.log('');
  console.log('Make sure the bot is running:');
  console.log('  node src/index-test.js');
  process.exit(1);
});

req.write(signal);
req.end();
