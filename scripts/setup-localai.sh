#!/bin/bash
# Setup LocalAI with required models for voice assistant

set -e

LOCALAI_URL="${LOCALAI_URL:-http://localhost:8080}"

echo "🎙️ Voice Assistant - LocalAI Setup"
echo "=================================="
echo ""

# Check if LocalAI is installed
if ! command -v local-ai &> /dev/null; then
    echo "📦 LocalAI not found. Installing via Homebrew..."
    
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found. Please install Homebrew first:"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    brew install localai
    echo "✅ LocalAI installed"
else
    echo "✅ LocalAI already installed"
fi

echo ""

# Check if LocalAI is running
check_localai() {
    curl -s "${LOCALAI_URL}/readyz" > /dev/null 2>&1
}

if ! check_localai; then
    echo "🚀 Starting LocalAI..."
    echo "   (This will run in the background)"
    echo ""
    
    # Start LocalAI in background
    nohup local-ai > /tmp/localai.log 2>&1 &
    LOCALAI_PID=$!
    echo "   PID: $LOCALAI_PID"
    echo "   Log: /tmp/localai.log"
    
    # Wait for LocalAI to be ready
    echo ""
    echo "⏳ Waiting for LocalAI to start..."
    for i in {1..30}; do
        if check_localai; then
            echo "✅ LocalAI is running at ${LOCALAI_URL}"
            break
        fi
        sleep 2
        echo -n "."
    done
    
    if ! check_localai; then
        echo ""
        echo "❌ LocalAI failed to start. Check /tmp/localai.log"
        exit 1
    fi
else
    echo "✅ LocalAI already running at ${LOCALAI_URL}"
fi

echo ""
echo "📥 Installing models..."
echo ""

# Function to install a model
install_model() {
    local model_name="$1"
    local model_url="$2"
    local description="$3"
    
    echo "Installing ${description}..."
    
    # Check if model exists by trying to use it
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${LOCALAI_URL}/v1/models" \
        -H "Content-Type: application/json" \
        -d "{\"id\": \"${model_name}\", \"url\": \"${model_url}\"}" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        echo "✅ ${description} installed"
    else
        echo "⚠️  ${description} may already exist or failed (HTTP ${response})"
    fi
}

# Install Whisper for STT
echo "1/3: Whisper (Speech-to-Text)"
curl -s -X POST "${LOCALAI_URL}/models/apply" \
    -H "Content-Type: application/json" \
    -d '{"id": "whisper-base", "url": "github:mudler/LocalAI/gallery/whisper-base.yaml"}' \
    > /dev/null 2>&1 || true
echo "     Requested whisper-base installation"

# Install functiongemma for LLM
echo ""
echo "2/3: FunctionGemma (LLM)"
curl -s -X POST "${LOCALAI_URL}/models/apply" \
    -H "Content-Type: application/json" \
    -d '{"id": "functiongemma", "url": "github:mudler/LocalAI/gallery/functiongemma.yaml"}' \
    > /dev/null 2>&1 || true
echo "     Requested functiongemma installation"

# Install TTS voice
echo ""
echo "3/3: Piper TTS (Text-to-Speech)"
curl -s -X POST "${LOCALAI_URL}/models/apply" \
    -H "Content-Type: application/json" \
    -d '{"id": "voice-en-us-amy-low", "url": "github:mudler/LocalAI/gallery/voice-en-us-amy-low.yaml"}' \
    > /dev/null 2>&1 || true
echo "     Requested voice-en-us-amy-low installation"

echo ""
echo "⏳ Models are downloading in the background..."
echo "   Check progress at: ${LOCALAI_URL} (Web UI)"
echo ""

# Wait a bit and check model status
sleep 5

echo "📋 Checking model status..."
echo ""
curl -s "${LOCALAI_URL}/v1/models" | grep -o '"id":"[^"]*"' | sed 's/"id":"//g' | sed 's/"//g' | while read model; do
    echo "   ✅ $model"
done

echo ""
echo "=================================="
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Wait for models to finish downloading (check ${LOCALAI_URL})"
echo "  2. Run: npm run dev:all"
echo "  3. Open: http://localhost:5173"
echo ""
echo "To stop LocalAI later:"
echo "  pkill -f local-ai"
echo ""

