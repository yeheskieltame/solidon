# Keeper + indexer image. Build context is the repo root (the keeper reads contracts/stocks):
#   docker build -f backend/keeper/Dockerfile -t solidon-keeper .
# backend/solana-spike rides along for the Solana pool re-peg (3_repeg.js needs the Raydium SDK, src/repeg.js).
FROM node:24-alpine
WORKDIR /app/backend/solana-spike
COPY backend/solana-spike/package.json backend/solana-spike/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY backend/solana-spike/*.js backend/solana-spike/state.json ./
WORKDIR /app/backend/keeper
COPY backend/keeper/package.json backend/keeper/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/keeper/ ./
COPY contracts/stocks/ /app/contracts/stocks/
ENV NODE_ENV=production
CMD ["node", "indexer.js"]
