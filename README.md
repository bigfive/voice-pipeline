# Voice Assistant

Push-to-talk voice assistant powered by LocalAI (STT + LLM + TTS).

## Architecture

```
Browser                    Server              LocalAI
┌─────────────┐           ┌────────┐          ┌─────────────┐
│  Capture    │──audio──▶│        │──POST──▶│  Whisper    │
│  Audio      │           │        │          │  (STT)      │
│             │           │  Node  │          │             │
│  Play       │◀─audio───│  WS    │◀─────────│  Piper      │
│  Audio      │           │  Proxy │          │  (TTS)      │
│             │           │        │          │             │
│  Show       │◀─text────│        │◀─stream──│  LLaMA/etc  │
│  Text       │           │        │          │  (LLM)      │
└─────────────┘           └────────┘          └─────────────┘
```

## Requirements

- Node.js 18+
- LocalAI running locally

## Quick Start

### 1. Install LocalAI

```bash
brew install localai
```

### 2. Start LocalAI and download models

```bash
# Start LocalAI
local-ai

# In the web UI (http://localhost:8080), install:
# - A Whisper model for STT
# - An LLM (e.g., llama3, phi3)
# - A TTS voice
```

Or via CLI:
```bash
local-ai models install whisper-base
local-ai models install functiongemma
local-ai models install voice-en-us-amy-low
```

### 3. Run the voice assistant

```bash
# Install deps
npm install

# Run both server + frontend
npm run dev:all

# Open http://localhost:5173
```

## Configuration

Edit `server/index.ts`:

```typescript
const CONFIG = {
  localai: {
    baseUrl: "http://localhost:8080",
    sttModel: "whisper-1",      // STT model name
    llmModel: "functiongemma",  // LLM model name  
    ttsModel: "tts-1",          // TTS model name
    ttsVoice: "alloy",          // TTS voice
    systemPrompt: "...",
  },
};
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend (port 5173) |
| `npm run dev:server` | Start server (port 8000) |
| `npm run dev:all` | Start both |

## Project Structure

```
├── src/                    # Frontend
│   ├── main.ts
│   └── voice-client.ts
├── server/
│   └── index.ts           # WebSocket proxy to LocalAI
├── index.html
└── package.json
```

## Why LocalAI?

- **One server** handles STT + LLM + TTS
- **OpenAI-compatible API** - standard interface
- **No native Node modules** - just HTTP calls
- **Easy model management** - web UI or CLI
- **Cross-platform** - brew install or Docker
