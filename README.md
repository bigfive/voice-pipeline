# Voice Assistant

Push-to-talk voice assistant with server-side STT/LLM/TTS.

## Architecture

```
Browser                    Server (Python)
┌─────────────┐           ┌─────────────────────┐
│  Capture    │──audio──▶│  faster-whisper     │
│  Audio      │           │  (STT)              │
│             │           │         │           │
│  Play       │◀─audio───│  Piper TTS          │
│  Audio      │           │         ▲           │
│             │           │         │           │
│  Show       │◀─text────│  Ollama (LLM)       │
│  Text       │           │                     │
└─────────────┘           └─────────────────────┘
      │                            │
      └────── WebSocket ───────────┘
```

## Requirements

- Python 3.10+
- Ollama running locally with a model (default: `gemma3n:e2b`)
- Node.js 18+

## Setup

### 1. Install Python dependencies

```bash
cd server
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### 2. Download Piper voice model

The first time you run the server, Piper will automatically download the voice model. You can also manually download:

```bash
# Install piper-tts CLI
pip install piper-tts

# List available voices
piper --help
```

### 3. Install frontend dependencies

```bash
npm install
```

### 4. Start Ollama

```bash
ollama serve
# In another terminal:
ollama pull gemma3n:e2b  # or your preferred model
```

## Running

### Start the server

```bash
cd server
source venv/bin/activate
python main.py
# Server runs on http://localhost:8000
```

### Start the frontend

```bash
npm run dev
# Frontend runs on http://localhost:5173
```

## Configuration

### Server (`server/main.py`)

```python
CONFIG = {
    "ollama": {
        "base_url": "http://localhost:11434",
        "model": "gemma3n:e2b",
        "system_prompt": "...",
    },
    "stt": {
        "model_size": "base.en",  # tiny.en, base.en, small.en, medium.en, large-v3
        "device": "auto",         # cpu, cuda, auto
    },
    "tts": {
        "model": "en_US-lessac-medium",  # Piper voice
    },
}
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
- **Server**: FastAPI + WebSockets
- **STT**: faster-whisper (CTranslate2)
- **TTS**: Piper
- **LLM**: Ollama
