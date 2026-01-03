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

```bash
# 1. Install deps
npm install

# 2. Setup LocalAI (installs LocalAI + downloads models)
npm run setup

# 3. Run the voice assistant
npm run dev:all

# 4. Open http://localhost:5173
```

The setup script will:
- Install LocalAI via Homebrew (if not installed)
- Start LocalAI in the background
- Download required models (Whisper, FunctionGemma, Piper TTS)

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
| `npm run setup` | Install LocalAI + download models |
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
