# Voice Assistant

Push-to-talk voice assistant - 100% local, powered by Transformers.js.

## Architecture

```
Browser                    Server (Node.js + Transformers.js)
┌─────────────┐           ┌──────────────────────────────────┐
│  Capture    │──audio───▶│  Whisper (STT)                   │
│  Audio      │           │          ↓                       │
│             │           │  SmolLM2 360M (LLM)              │
│  Play       │◀──audio───│          ↓                       │
│  Audio      │           │  SpeechT5 (TTS)                  │
│             │           │                                  │
│  Show       │◀──text────│                                  │
│  Text       │           │                                  │
└─────────────┘           └──────────────────────────────────┘
```

## Requirements

- Node.js 18+

That's it. No Docker, no external services.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the app (first run downloads ~1GB of models)
npm run dev:all

# 3. Open http://localhost:5173
```

First run downloads models from Hugging Face (~1GB total). They're cached in `~/.cache/huggingface`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend (port 5173) |
| `npm run dev:server` | Start server (port 8000) |
| `npm run dev:all` | Start server + frontend |

## Models

All models run locally via Transformers.js:

| Component | Model | Size |
|-----------|-------|------|
| STT | [Xenova/whisper-small](https://huggingface.co/Xenova/whisper-small) | ~250MB |
| LLM | [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) | ~360MB |
| TTS | [Xenova/speecht5_tts](https://huggingface.co/Xenova/speecht5_tts) | ~250MB |

## Configuration

Edit `server/index.ts`:

```typescript
const CONFIG = {
  stt: {
    model: "Xenova/whisper-small",  // or whisper-tiny, whisper-base
  },
  llm: {
    model: "HuggingFaceTB/SmolLM2-360M-Instruct",
    systemPrompt: "...",
    maxNewTokens: 100,
  },
  tts: {
    model: "Xenova/speecht5_tts",
  },
};
```

## Project Structure

```
├── src/                    # Frontend
│   ├── main.ts
│   └── voice-client.ts
├── server/
│   └── index.ts           # WebSocket server with STT/LLM/TTS
├── index.html
└── package.json
```

## How It Works

1. **Browser** captures audio via MediaRecorder and sends it over WebSocket
2. **Server** transcribes audio using Whisper
3. **Server** generates response with Granite (streamed)
4. **Server** synthesizes each sentence with SpeechT5
5. **Browser** plays back the audio chunks as they arrive

All AI processing runs locally in Node.js - no cloud APIs, no Docker, no external dependencies.