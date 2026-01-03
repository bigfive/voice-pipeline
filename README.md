# Voice Assistant

Push-to-talk voice assistant powered by LocalAI (STT + LLM + TTS).

## Architecture

```
Browser                    Server              LocalAI (Docker)
┌─────────────┐           ┌────────┐          ┌─────────────┐
│  Capture    │──audio──▶│        │──POST──▶│  Whisper    │
│  Audio      │           │        │          │  (STT)      │
│             │           │  Node  │          │             │
│  Play       │◀─audio───│  WS    │◀─────────│  Piper      │
│  Audio      │           │  Proxy │          │  (TTS)      │
│             │           │        │          │             │
│  Show       │◀─text────│        │◀─stream──│  Gemma      │
│  Text       │           │        │          │  (LLM)      │
└─────────────┘           └────────┘          └─────────────┘
```

## Requirements

- Node.js 18+
- Docker

## Quick Start

```bash
# 1. Install deps
npm install

# 2. Start LocalAI (first run will download models ~2GB)
npm run localai

# 3. In another terminal, start the app
npm run dev:all

# 4. Open http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run localai` | Start LocalAI in Docker |
| `npm run localai:build` | Rebuild LocalAI image |
| `npm run dev` | Start frontend (port 5173) |
| `npm run dev:server` | Start server (port 8000) |
| `npm run dev:all` | Start server + frontend |

## Pre-installed Models

The Docker image includes:

| Model | Purpose | Size |
|-------|---------|------|
| `whisper-base` | Speech-to-Text | ~150MB |
| `gemma-2-2b` | LLM (Q4 quantized) | ~1.5GB |
| `piper en_US-amy` | Text-to-Speech | ~100MB |

## Configuration

Edit `server/index.ts`:

```typescript
const CONFIG = {
  localai: {
    baseUrl: "http://localhost:8080",
    sttModel: "whisper-base",
    llmModel: "functiongemma",
    ttsModel: "tts-1",
    ttsVoice: "en_US-amy-medium",
    systemPrompt: "...",
  },
};
```

## Project Structure

```
├── src/                    # Frontend
│   ├── main.ts
│   └── voice-client.ts
├── server/
│   └── index.ts           # WebSocket proxy to LocalAI
├── localai/
│   ├── Dockerfile         # Pre-configured LocalAI
│   ├── docker-compose.yaml
│   └── models/            # Model configs
│       ├── whisper-base.yaml
│       ├── llm.yaml
│       └── tts.yaml
├── index.html
└── package.json
```

## Customizing Models

To change models, edit the YAML files in `localai/models/` and rebuild:

```bash
npm run localai:build
npm run localai
```

See [LocalAI Model Gallery](https://localai.io/models/) for available models.
