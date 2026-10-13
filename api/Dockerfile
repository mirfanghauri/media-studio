FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY api/package.json ./
RUN npm install --omit=dev

COPY api/ ./
COPY services/ ./services/
COPY shared/ ./shared/

# Pre-create storage dirs with correct ownership
RUN mkdir -p /app/storage/videos /app/storage/frames /app/storage/transcripts /app/storage/results /app/storage/images /app/storage/music \
    && chown -R node:node /app/storage

EXPOSE 3000

CMD ["node", "server.js"]
