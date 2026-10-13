"""
Media Studio - Whisper Transcription Service
Optimized for ARM64 CPU with int8 quantization
"""

import sys
import json
import os
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def transcribe(video_path: str, model_size: str = "base") -> list[dict]:
    """Transcribe video/audio file using faster-whisper."""
    from faster_whisper import WhisperModel

    if not Path(video_path).exists():
        logger.error(f"File not found: {video_path}")
        sys.exit(1)

    logger.info(f"Loading Whisper model: {model_size} (int8)")
    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8",
        cpu_threads=os.cpu_count() or 2,
    )

    logger.info(f"Transcribing: {video_path}")
    segments, info = model.transcribe(
        video_path,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
        ),
    )

    logger.info(f"Detected language: {info.language} (prob={info.language_probability:.2f})")

    result = []
    for segment in segments:
        result.append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip(),
        })

    logger.info(f"Transcription complete: {len(result)} segments")
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <video_path> [model_size]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else os.getenv("WHISPER_MODEL", "base")

    result = transcribe(video_path, model_size)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
