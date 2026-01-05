#!/bin/bash
#
# Setup script - downloads models and binaries for native backends
# Usage: npm run setup  (or ./scripts/setup.sh)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PROJECT_DIR/models"
BIN_DIR="$PROJECT_DIR/bin"

echo "Project directory: $PROJECT_DIR"
echo "Models directory: $MODELS_DIR"
echo "Binaries directory: $BIN_DIR"

mkdir -p "$MODELS_DIR"
mkdir -p "$BIN_DIR"

# ============ Models ============

cd "$MODELS_DIR"

# Whisper model (whisper.cpp format - Large V3 Turbo quantized)
echo ""
echo "==> Downloading Whisper model (~850MB)..."
if [ -f "whisper-large-v3-turbo-q8.bin" ]; then
  echo "    Already exists, skipping."
else
  curl -L --progress-bar -o whisper-large-v3-turbo-q8.bin \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin"
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

# TTS model (sherpa-onnx compatible Piper model)
echo ""
echo "==> Downloading TTS model (~60MB)..."
if [ -d "vits-piper-en_US-lessac-medium" ]; then
  echo "    Already exists, skipping."
else
  curl -L --progress-bar -o vits-piper-en_US-lessac-medium.tar.bz2 \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2"
  tar -xjf vits-piper-en_US-lessac-medium.tar.bz2
  rm vits-piper-en_US-lessac-medium.tar.bz2
fi

# ============ Binaries ============

cd "$BIN_DIR"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

# --- whisper.cpp ---
echo ""
echo "==> Setting up whisper-cli..."
if [ -L "whisper-cli" ] || [ -f "whisper-cli" ]; then
  echo "    Already exists, skipping."
else
  # Try to find whisper-cli from Homebrew or PATH
  if command -v whisper-cli &> /dev/null; then
    WHISPER_PATH="$(command -v whisper-cli)"
    ln -s "$WHISPER_PATH" whisper-cli
    echo "    Linked to $WHISPER_PATH"
  elif [ -f "/opt/homebrew/bin/whisper-cli" ]; then
    ln -s /opt/homebrew/bin/whisper-cli whisper-cli
    echo "    Linked to /opt/homebrew/bin/whisper-cli"
  elif [ -f "/usr/local/bin/whisper-cli" ]; then
    ln -s /usr/local/bin/whisper-cli whisper-cli
    echo "    Linked to /usr/local/bin/whisper-cli"
  else
    echo "    ⚠️  whisper-cli not found. Install with: brew install whisper-cpp"
  fi
fi

# --- llama.cpp ---
echo ""
echo "==> Setting up llama-cli..."
if [ -L "llama-cli" ] || [ -f "llama-cli" ]; then
  echo "    Already exists, skipping."
else
  # Try to find llama-cli from Homebrew or PATH
  if command -v llama-cli &> /dev/null; then
    LLAMA_PATH="$(command -v llama-cli)"
    ln -s "$LLAMA_PATH" llama-cli
    echo "    Linked to $LLAMA_PATH"
  elif [ -f "/opt/homebrew/bin/llama-cli" ]; then
    ln -s /opt/homebrew/bin/llama-cli llama-cli
    echo "    Linked to /opt/homebrew/bin/llama-cli"
  elif [ -f "/usr/local/bin/llama-cli" ]; then
    ln -s /usr/local/bin/llama-cli llama-cli
    echo "    Linked to /usr/local/bin/llama-cli"
  else
    echo "    ⚠️  llama-cli not found. Install with: brew install llama.cpp"
  fi
fi

# --- sherpa-onnx (TTS) ---
echo ""
echo "==> Setting up sherpa-onnx for $OS/$ARCH..."

if [ -f "sherpa-onnx-offline-tts" ]; then
  echo "    Already exists, skipping."
else
  case "$OS" in
    Darwin)
      # macOS - universal binary (arm64 + x86_64)
      SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.20/sherpa-onnx-v1.12.20-osx-universal2-shared.tar.bz2"
      SHERPA_DIR="sherpa-onnx-v1.12.20-osx-universal2-shared"
      ;;
    Linux)
      if [ "$ARCH" = "x86_64" ]; then
        SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.20/sherpa-onnx-v1.12.20-linux-x64-shared.tar.bz2"
        SHERPA_DIR="sherpa-onnx-v1.12.20-linux-x64-shared"
      elif [ "$ARCH" = "aarch64" ]; then
        SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.20/sherpa-onnx-v1.12.20-linux-aarch64-shared.tar.bz2"
        SHERPA_DIR="sherpa-onnx-v1.12.20-linux-aarch64-shared"
      else
        echo "    Unsupported Linux architecture: $ARCH"
        exit 1
      fi
      ;;
    *)
      echo "    Unsupported OS: $OS"
      echo "    Download manually from: https://github.com/k2-fsa/sherpa-onnx/releases"
      exit 1
      ;;
  esac

  echo "    Downloading from $SHERPA_URL..."
  curl -L --progress-bar -o sherpa-onnx.tar.bz2 "$SHERPA_URL"
  tar -xjf sherpa-onnx.tar.bz2

  # Only copy the TTS binary we need (not all the extras)
  cp "$SHERPA_DIR/bin/sherpa-onnx-offline-tts" .
  mkdir -p lib
  mv "$SHERPA_DIR/lib/"* lib/

  # Fix library paths on macOS so binary can find libs in ./lib/
  if [ "$OS" = "Darwin" ]; then
    echo "    Fixing library paths..."
    for lib in lib/*.dylib; do
      libname=$(basename "$lib")
      install_name_tool -change "@rpath/$libname" "@executable_path/lib/$libname" sherpa-onnx-offline-tts 2>/dev/null || true
    done
  fi

  # Cleanup
  rm -rf "$SHERPA_DIR" sherpa-onnx.tar.bz2

  echo "    Done!"
fi

# ============ Summary ============

echo ""
echo "============================================================"
echo "Setup complete!"
echo "============================================================"
echo ""
echo "Models:"
ls -lh "$MODELS_DIR"
echo ""
echo "Binaries (bin/):"
ls -lh "$BIN_DIR"

# Check for missing dependencies
MISSING=""
[ ! -L "$BIN_DIR/whisper-cli" ] && [ ! -f "$BIN_DIR/whisper-cli" ] && MISSING="$MISSING whisper-cpp"
[ ! -L "$BIN_DIR/llama-cli" ] && [ ! -f "$BIN_DIR/llama-cli" ] && MISSING="$MISSING llama.cpp"

if [ -n "$MISSING" ]; then
  echo ""
  echo "⚠️  Missing dependencies. Install with:"
  echo "  brew install$MISSING"
  echo ""
  echo "Then re-run this script to create symlinks."
else
  echo ""
  echo "✅ All dependencies installed!"
  echo ""
  echo "Run the native server with:"
  echo "  npm run dev:server-native"
fi

