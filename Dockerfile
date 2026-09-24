# syntax=docker/dockerfile:1

# Build stage: compile TypeScript -> dist/ (dist is gitignored, so it must be built here)
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production deps + compiled output only
FROM node:${NODE_VERSION}-alpine AS release

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

# The server speaks MCP over stdio.
ENTRYPOINT ["node", "/app/dist/index.js"]
