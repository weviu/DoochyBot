# Multi-stage build for trading bot
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (all, for building)
RUN npm ci

# Final stage - production image
FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create data directory
RUN mkdir -p data && chown nodejs:nodejs data

# Switch to non-root user
USER nodejs

# Expose proxy port
EXPOSE 9009

# Health check - verify proxy is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9009/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode); })" || exit 1

# Use dumb-init to handle signals properly (important for graceful shutdown)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start bot
CMD ["npm", "start"]
