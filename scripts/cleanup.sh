#!/bin/bash

# Cleanup script for realtime-s2s
# Kills rogue processes and optionally clears model cache

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$PROJECT_DIR/node_modules/@huggingface/transformers/.cache"

echo "🧹 Cleaning up realtime-s2s..."

# Find and kill any rogue processes
echo ""
echo "Looking for rogue processes..."

PIDS=$(ps aux | grep "$PROJECT_DIR" | grep -v grep | grep -v "cleanup.sh" | awk '{print $2}' || true)

if [ -n "$PIDS" ]; then
    echo "Found processes: $PIDS"
    echo "Killing processes..."

    # Try graceful kill first
    echo "$PIDS" | xargs kill 2>/dev/null || true
    sleep 1

    # Check if any survived, force kill if needed
    SURVIVING=$(ps aux | grep "$PROJECT_DIR" | grep -v grep | grep -v "cleanup.sh" | awk '{print $2}' || true)
    if [ -n "$SURVIVING" ]; then
        echo "Force killing stubborn processes: $SURVIVING"
        echo "$SURVIVING" | xargs kill -9 2>/dev/null || true
    fi

    echo "✅ Processes killed"
else
    echo "✅ No rogue processes found"
fi

# Clear model cache if --cache flag is passed
if [[ "$1" == "--cache" ]] || [[ "$1" == "-c" ]]; then
    echo ""
    echo "Clearing model cache..."

    if [ -d "$CACHE_DIR" ]; then
        rm -rf "$CACHE_DIR"
        echo "✅ Model cache cleared ($CACHE_DIR)"
        echo "⚠️  Models will be re-downloaded on next run"
    else
        echo "✅ No cache to clear"
    fi
else
    echo ""
    echo "ℹ️  Run with --cache or -c to also clear the model cache"
fi

echo ""
echo "🎉 Cleanup complete!"

