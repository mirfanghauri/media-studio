#!/bin/bash
set -euo pipefail

INPUT="$1"
OUTPUT_DIR="$2"
FPS="${3:-1}"
MAX_FRAMES="${4:-30}"

mkdir -p "$OUTPUT_DIR"

# Get video duration for smart frame sampling
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT" 2>/dev/null | head -1)
DURATION=${DURATION%.*}

if [ -z "$DURATION" ] || [ "$DURATION" -eq 0 ]; then
    echo "Warning: Could not determine video duration, using default FPS extraction"
    ffmpeg -i "$INPUT" -vf "fps=${FPS}" -q:v 3 -frames:v "$MAX_FRAMES" "$OUTPUT_DIR/frame_%04d.jpg" -y -loglevel warning
    exit 0
fi

# Calculate total frames at given FPS
TOTAL_FRAMES=$((DURATION * FPS))

if [ "$TOTAL_FRAMES" -le "$MAX_FRAMES" ]; then
    # Video is short enough, extract at given FPS
    ffmpeg -i "$INPUT" -vf "fps=${FPS}" -q:v 3 "$OUTPUT_DIR/frame_%04d.jpg" -y -loglevel warning
else
    # Video is too long, sample evenly across duration
    INTERVAL=$(echo "scale=2; $DURATION / $MAX_FRAMES" | bc)
    ffmpeg -i "$INPUT" -vf "fps=1/${INTERVAL}" -q:v 3 -frames:v "$MAX_FRAMES" "$OUTPUT_DIR/frame_%04d.jpg" -y -loglevel warning
fi

FRAME_COUNT=$(ls -1 "$OUTPUT_DIR"/frame_*.jpg 2>/dev/null | wc -l)
echo "Extracted $FRAME_COUNT frames from ${DURATION}s video"
