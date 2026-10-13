# Worker: Node.js + Python + FFmpeg in one container
FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    bc \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /app

# Setup Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install Python dependencies
COPY python/requirements.txt /app/python/requirements.txt
RUN pip install --no-cache-dir -r /app/python/requirements.txt

# Pre-download Whisper model (base) to avoid download at runtime
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', compute_type='int8')" || true

# Install Node.js dependencies
COPY worker/package.json /app/worker/package.json
RUN cd /app/worker && npm install --omit=dev

# Shared modules are loaded from /app/shared, so expose worker dependencies at /app/node_modules too.
RUN ln -s /app/worker/node_modules /app/node_modules

# Copy application files
COPY worker/ /app/worker/
COPY python/ /app/python/
COPY scripts/ /app/scripts/
COPY services/ /app/services/
COPY shared/ /app/shared/

RUN chmod +x /app/scripts/*.sh

# Create storage directories
RUN mkdir -p /app/storage/videos /app/storage/frames /app/storage/transcripts /app/storage/results /app/storage/images /app/storage/music

WORKDIR /app/worker

CMD ["node", "processor.js"]
