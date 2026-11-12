# Keeper + indexer image. Build context is the repo root (the keeper reads contracts/stocks):
#   docker build -f backend/keeper/Dockerfile -t solidon-keeper .
FROM node:24-alpine
WORKDIR /app/backend/keeper
COPY backend/keeper/package.json backend/keeper/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/keeper/ ./
COPY contracts/stocks/ /app/contracts/stocks/
ENV NODE_ENV=production
CMD ["node", "indexer.js"]
