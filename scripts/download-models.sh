#!/bin/bash
#
# Download models for native backends
# Usage: ./scripts/download-models.sh
#

set -e

MODELS_DIR="${1:-./models}"

echo "Downloading models to $MODELS_DIR..."
mkdir -p "$MODELS_DIR"
cd "$MODELS_DIR"

# Whisper model (whisper.cpp format)
echo ""
echo "==> Downloading Whisper model (~500MB)..."
if [ -f "whisper-small.bin" ]; then
  echo "    Already exists, skipping."
else
  curl -L --progress-bar -o whisper-small.bin \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
fi

# LLM model (GGUF format)
echo ""
echo "==> Downloading SmolLM2 model (~1GB)..."
if [ -f "smollm2-1.7b-instruct-q4_k_m.gguf" ]; then
  echo "    Already exists, skipping."
else
  curl -L --progress-bar -o smollm2-1.7b-instruct-q4_k_m.gguf \
    "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf"
fi

# Piper voice model
echo ""
echo "==> Downloading Piper voice model (~100MB)..."
if [ -f "en_US-lessac-medium.onnx" ]; then
  echo "    Already exists, skipping."
else
  curl -L --progress-bar -o en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
  curl -L --progress-bar -o en_US-lessac-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
fi

echo ""
echo "Done! Models downloaded to $MODELS_DIR"
echo ""
echo "Files:"
ls -lh

