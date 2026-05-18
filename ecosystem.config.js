module.exports = {
  apps: [{
    name: 'DoochyBot',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '500M',
    error_file: './data/pm2-error.log',
    out_file: './data/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Restart if crashes more than 15 times in 15 minutes
    max_restarts: 15,
    min_uptime: '60s',
    autorestart: true
  }]
};
