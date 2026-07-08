# Multi-stage build for the curation backend (bot + read-only API).
# better-sqlite3 is a native module, so the build stage needs a toolchain.

FROM node:20-bookworm-slim AS build
WORKDIR /app
# Build tools for native deps (better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Runtime deps only (still needs build tools to compile better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Data volume (SQLite file). Overridable via DATABASE_PATH.
ENV DATABASE_PATH=/data/radar.sqlite
VOLUME ["/data"]

EXPOSE 3000
CMD ["node", "dist/index.js"]
