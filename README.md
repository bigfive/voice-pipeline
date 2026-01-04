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

Edit `server/config.ts` or use environment variables:

```typescript
export const config: ServerConfig = {
  port: Number(process.env.PORT) || 8000,
  
  stt: {
    model: process.env.STT_MODEL || 'Xenova/whisper-small',
    // ...
  },
  
  llm: {
    model: process.env.LLM_MODEL || 'HuggingFaceTB/SmolLM2-360M-Instruct',
    systemPrompt: process.env.SYSTEM_PROMPT || '...',
    maxNewTokens: Number(process.env.MAX_TOKENS) || 200,
    // ...
  },
  
  tts: {
    model: process.env.TTS_MODEL || 'Xenova/speecht5_tts',
    // ...
  },
};
```

## Project Structure

```
├── shared/                       # Shared types & protocols
│   ├── protocol.ts               # WebSocket message types
│   └── types.ts                  # Domain types
│
├── server/
│   ├── index.ts                  # Entry point (composition root)
│   ├── config.ts                 # Configuration management
│   │
│   ├── infrastructure/           # Transport layer
│   │   ├── http-server.ts        # Health endpoints
│   │   └── websocket-server.ts   # WebSocket connection management
│   │
│   ├── pipelines/                # AI Pipeline abstractions
│   │   ├── types.ts              # Pipeline interfaces
│   │   ├── stt-pipeline.ts       # Speech-to-Text (Whisper)
│   │   ├── llm-pipeline.ts       # Language Model (SmolLM2)
│   │   └── tts-pipeline.ts       # Text-to-Speech (SpeechT5)
│   │
│   ├── services/                 # Domain services
│   │   ├── conversation-service.ts  # Session & history management
│   │   ├── voice-service.ts      # STT → LLM → TTS orchestration
│   │   └── text-normalizer.ts    # TTS text preprocessing
│   │
│   └── handlers/                 # WebSocket message handlers
│       └── voice-handler.ts      # Audio/conversation handling
│
├── src/                          # Client (Browser)
│   ├── main.ts                   # Entry point & orchestration
│   ├── config.ts                 # Client configuration
│   │
│   ├── services/                 # Client services
│   │   ├── audio-recorder.ts     # Microphone capture
│   │   ├── audio-player.ts       # Audio playback queue
│   │   └── websocket-client.ts   # Server communication
│   │
│   ├── state/                    # State management
│   │   └── app-state.ts          # State machine
│   │
│   └── ui/                       # Presentation
│       ├── components.ts         # UI components
│       └── layout.ts             # Main layout
│
├── index.html                    # HTML shell
└── package.json
```

## Design Principles

### Separation of Concerns

- **Pipelines**: Each AI model (STT, LLM, TTS) is abstracted behind an interface, making them independently testable and swappable
- **Services**: Business logic is encapsulated in services (conversation management, voice orchestration)
- **Infrastructure**: Transport concerns (HTTP, WebSocket) are isolated from domain logic
- **Protocol**: WebSocket messages are formally typed for compile-time safety

### Key Components

| Component | Responsibility |
|-----------|----------------|
| `VoiceService` | Orchestrates STT → LLM → TTS flow |
| `ConversationService` | Manages chat history per session |
| `TextNormalizer` | Converts numbers/abbreviations for TTS |
| `WebSocketServerWrapper` | Manages connections, routes messages |
| `VoiceHandler` | Handles audio messages, coordinates services |

## How It Works

1. **Browser** captures audio via `AudioRecorder` and sends PCM chunks over WebSocket
2. **Server** accumulates audio, then `VoiceHandler` triggers processing
3. `VoiceService` orchestrates the pipeline:
   - `STTPipeline` transcribes audio using Whisper
   - `LLMPipeline` generates response with SmolLM2
   - `TTSPipeline` synthesizes each sentence with SpeechT5
4. **Browser** receives audio chunks via `WebSocketClient`
5. `AudioPlayer` queues and plays audio in order

All AI processing runs locally in Node.js - no cloud APIs, no Docker, no external dependencies.
