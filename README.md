# Voice Assistant

Push-to-talk voice assistant with server-side STT/LLM/TTS — all TypeScript.

## Architecture

```
Browser                    Server (Node.js)
┌─────────────┐           ┌─────────────────────┐
│  Capture    │──audio──▶│  Whisper (STT)      │
│  Audio      │           │         │           │
│             │           │         ▼           │
│  Play       │◀─audio───│  Piper (TTS)        │
│  Audio      │           │         ▲           │
│             │           │         │           │
│  Show       │◀─text────│  Ollama (LLM)       │
│  Text       │           │                     │
└─────────────┘           └─────────────────────┘
      │                            │
      └────── WebSocket ───────────┘
```

## Requirements

- Node.js 18+
- Ollama running locally

## Quick Start

```bash
# 1. Install deps + download models (~300MB)
npm run setup

# 2. Start Ollama
ollama serve
ollama pull gemma3n:e2b

# 3. Run both server and frontend
npm run dev:all

# 4. Open http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install deps + download models |
| `npm run dev` | Start frontend only (port 5173) |
| `npm run dev:server` | Start server only (port 8000) |
| `npm run dev:all` | Start both concurrently |
| `npm run download-models` | Re-download STT/TTS models |

## Configuration

Edit `server/index.ts`:

```typescript
const CONFIG = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "gemma3n:e2b",
    systemPrompt: "...",
  },
};
```

## Project Structure

```
├── src/                    # Frontend
│   ├── main.ts
│   └── voice-client.ts
├── server/                 # Backend
│   ├── index.ts           # WebSocket server
│   ├── stt.ts             # Whisper STT
│   ├── tts.ts             # Piper TTS
│   ├── llm.ts             # Ollama client
│   ├── models/            # Downloaded models (gitignored)
│   └── scripts/
│       └── download-models.ts
├── index.html
└── package.json
```

## Tech Stack

- **Frontend**: Vite + TypeScript
- **Server**: Node.js + WebSockets + tsx
- **STT**: sherpa-onnx (Whisper small.en)
- **TTS**: sherpa-onnx (Piper)
- **LLM**: Ollama
