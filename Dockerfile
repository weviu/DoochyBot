FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-alpine
RUN apk add --no-cache dumb-init
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data
EXPOSE 9009
ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "start"]
