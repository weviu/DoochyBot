const logger = require('../utils/logger');

class TokenManager {
  constructor(options = {}) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenExpiryTime = null;
    this.refreshTimer = null;
  }

  setTokenExpiry(expiresIn) {
    // expiresIn is in seconds
    if (expiresIn) {
      // Refresh at 80% of expiry time to be safe
      const refreshIn = expiresIn * 0.8 * 1000;
      
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }

      logger.info('Token expiry set', { expiresInSeconds: expiresIn });
      
      this.refreshTimer = setTimeout(() => {
        this.refreshAccessToken();
      }, refreshIn);
    }
  }

  async refreshAccessToken() {
    logger.info('Attempting to refresh access token');
    
    try {
      // In a real implementation, this would call cTrader's token refresh endpoint
      // For now, we'll log the intent and return true (actual refresh happens at connection level)
      
      // This is typically a REST call to the auth server
      // POST /oauth/access-token with refresh_token
      
      logger.info('Access token refresh logic triggered');
      return true;
    } catch (err) {
      logger.error('Failed to refresh token', { error: err.message });
      return false;
    }
  }

  getAccessToken() {
    return this.accessToken;
  }

  setAccessToken(token) {
    this.accessToken = token;
    logger.info('Access token updated');
  }

  getRefreshToken() {
    return this.refreshToken;
  }

  setRefreshToken(token) {
    this.refreshToken = token;
    logger.info('Refresh token updated');
  }

  async cleanup() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
  }
}

module.exports = TokenManager;
