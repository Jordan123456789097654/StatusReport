# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts --ignore-scripts

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S sr && adduser -S sr -G sr
COPY --from=build --chown=sr:sr /app/package.json ./
COPY --from=build --chown=sr:sr /app/node_modules ./node_modules
COPY --from=build --chown=sr:sr /app/.next ./.next
COPY --from=build --chown=sr:sr /app/next.config.ts ./
COPY --from=build --chown=sr:sr /app/prisma ./prisma
COPY --from=build --chown=sr:sr /app/scripts ./scripts
COPY --from=build --chown=sr:sr /app/src ./src
COPY --from=build --chown=sr:sr /app/worker ./worker
RUN mkdir -p /app/data && chown sr:sr /app/data
VOLUME ["/app/data"]
USER sr
EXPOSE 3000
# Apply the schema on start (idempotent), then run the web server.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -p ${PORT:-3000}"]
