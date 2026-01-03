# Voice Assistant

Push-to-talk voice assistant with server-side STT/LLM/TTS — all in TypeScript.

## Architecture

```
Browser                    Server (Node.js)
┌─────────────┐           ┌─────────────────────┐
│  Capture    │──audio──▶│  sherpa-onnx        │
│  Audio      │           │  Whisper (STT)      │
│             │           │         │           │
│  Play       │◀─audio───│  sherpa-onnx        │
│  Audio      │           │  Piper (TTS)        │
│             │           │         ▲           │
│  Show       │◀─text────│  Ollama (LLM)       │
│  Text       │           │                     │
└─────────────┘           └─────────────────────┘
      │                            │
      └────── WebSocket ───────────┘
```

## Requirements

- Node.js 18+
- Ollama running locally with a model (default: `gemma3n:e2b`)

## Quick Start

```bash
# 1. Install everything + download models (~500MB)
npm run setup

# 2. Start Ollama (in another terminal)
ollama serve
ollama pull gemma3n:e2b

# 3. Start the server
npm run server:dev

# 4. Start the frontend (in another terminal)
npm run dev

# 5. Open http://localhost:5173
```

## Manual Setup

### Install dependencies

```bash
# Frontend
npm install

# Server
cd server
npm install
```

### Download models

```bash
cd server
npm run download-models
```

This downloads:
- **Whisper small.en** (~250MB) - Speech-to-text
- **Piper lessac-medium** (~65MB) - Text-to-speech

### Run

```bash
# Terminal 1: Server
cd server
npm run dev
# Runs on ws://localhost:8000

# Terminal 2: Frontend
npm run dev
# Runs on http://localhost:5173
```

## Configuration

### Server (`server/src/index.ts`)

```typescript
const CONFIG = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "gemma3n:e2b",
    systemPrompt: "...",
  },
};
```

### Client (`src/voice-client.ts`)

```typescript
export const CONFIG = {
  serverUrl: "ws://localhost:8000/ws",
  sampleRate: 16000,
};
```

## Usage

1. Open http://localhost:5173
2. Press and hold the button (or spacebar) to speak
3. Release to send audio to server
4. Listen to the response

## Tech Stack

- **Frontend**: Vite + TypeScript
- **Server**: Node.js + WebSockets
- **STT**: sherpa-onnx (Whisper small.en)
- **TTS**: sherpa-onnx (Piper)
- **LLM**: Ollama

## Project Structure

```
├── src/                    # Frontend
│   ├── main.ts            # UI entry point
│   └── voice-client.ts    # WebSocket client
├── server/                 # Backend
│   ├── src/
│   │   ├── index.ts       # Server entry point
│   │   ├── stt.ts         # Whisper STT
│   │   ├── tts.ts         # Piper TTS
│   │   └── llm.ts         # Ollama client
│   ├── models/            # Downloaded models (gitignored)
│   └── scripts/
│       └── download-models.ts
└── index.html
```
