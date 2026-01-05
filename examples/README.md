# Voice Pipeline Examples

Interactive examples demonstrating all the different configuration modes.

## Quick Start

```bash
npm install

# Pick an example to run (starts both Vite + server):
npm run dev                     # Vite only (for local examples that don't need a server)
npm run dev:transformers        # transformers-transformers-transformers (port 3100)
npm run dev:native              # native-native-native (port 3101)
npm run dev:native-transformers # native-transformers-speech (port 3102)
npm run dev:transformers-speech # transformers-transformers-speech (port 3103)
npm run dev:speech-native       # speech-native-speech (port 3104)

# Then open http://localhost:5173
```

> **Note:** Each server example loads ML models into memory. Run one at a time to avoid exhausting RAM.

## Available Examples

| Example | Type | Description |
|---------|------|-------------|
| `speech-browser-speech` | Local | WebSpeech STT → Browser LLM → WebSpeech TTS |
| `browser-browser-speech` | Local | Browser Whisper → Browser LLM → WebSpeech TTS |
| `transformers-transformers-transformers` | Remote | All Transformers.js on server |
| `native-native-native` | Remote | All native binaries on server |
| `speech-native-speech` | Hybrid | WebSpeech STT → Native LLM → WebSpeech TTS |
| `transformers-transformers-speech` | Hybrid | Server Whisper → Server LLM → WebSpeech TTS |
| `native-transformers-speech` | Mixed | Native whisper.cpp → TF.js LLM → WebSpeech TTS |

## All Possible Configurations

Naming convention: `{stt}-{llm}-{tts}` where each component is:

| Option | STT | LLM | TTS |
|--------|-----|-----|-----|
| **native** | whisper.cpp (server) | llama.cpp (server) | sherpa-onnx (server) |
| **transformers** | Whisper Transformers.js (server) | SmolLM/Phi3 Transformers.js (server) | SpeechT5 Transformers.js (server) |
| **browser** | Whisper Transformers.js (browser) | SmolLM/Phi3 Transformers.js (browser) | ⚠️ No good model yet |
| **speech** | WebSpeech API (browser) | ❌ N/A | WebSpeech API (browser) |

### Fully Local (4 combinations)

| Config | STT | LLM | TTS | Status |
|--------|-----|-----|-----|--------|
| `speech-browser-speech` | WebSpeech | Browser Transformers | WebSpeech | ✅ Example |
| `browser-browser-speech` | Browser Whisper | Browser Transformers | WebSpeech | ✅ Example |
| `speech-browser-browser` | WebSpeech | Browser Transformers | Browser TTS | ⚠️ No browser TTS model |
| `browser-browser-browser` | Browser Whisper | Browser Transformers | Browser TTS | ⚠️ No browser TTS model |

### Fully Remote (8 combinations)

| Config | STT | LLM | TTS | Status |
|--------|-----|-----|-----|--------|
| `native-native-native` | whisper.cpp | llama.cpp | sherpa-onnx | ✅ Example |
| `transformers-transformers-transformers` | Server Whisper | Server LLM | SpeechT5 | ✅ Example |
| `native-native-transformers` | whisper.cpp | llama.cpp | SpeechT5 | ✅ Possible |
| `native-transformers-native` | whisper.cpp | Server LLM | sherpa-onnx | ✅ Possible |
| `native-transformers-transformers` | whisper.cpp | Server LLM | SpeechT5 | ✅ Possible |
| `transformers-native-native` | Server Whisper | llama.cpp | sherpa-onnx | ✅ Possible |
| `transformers-native-transformers` | Server Whisper | llama.cpp | SpeechT5 | ✅ Possible |
| `transformers-transformers-native` | Server Whisper | Server LLM | sherpa-onnx | ✅ Possible |

### Hybrid: Local STT + Server LLM + Local TTS (8 combinations)

| Config | STT | LLM | TTS | Status |
|--------|-----|-----|-----|--------|
| `speech-native-speech` | WebSpeech | llama.cpp | WebSpeech | ✅ Example |
| `speech-transformers-speech` | WebSpeech | Server LLM | WebSpeech | ✅ Possible |
| `browser-native-speech` | Browser Whisper | llama.cpp | WebSpeech | ✅ Possible |
| `browser-transformers-speech` | Browser Whisper | Server LLM | WebSpeech | ✅ Possible |
| `speech-native-browser` | WebSpeech | llama.cpp | Browser TTS | ⚠️ No browser TTS model |
| `speech-transformers-browser` | WebSpeech | Server LLM | Browser TTS | ⚠️ No browser TTS model |
| `browser-native-browser` | Browser Whisper | llama.cpp | Browser TTS | ⚠️ No browser TTS model |
| `browser-transformers-browser` | Browser Whisper | Server LLM | Browser TTS | ⚠️ No browser TTS model |

### Hybrid: Local STT + Server LLM + Server TTS (8 combinations)

| Config | STT | LLM | TTS | Status |
|--------|-----|-----|-----|--------|
| `speech-native-native` | WebSpeech | llama.cpp | sherpa-onnx | ✅ Possible |
| `speech-native-transformers` | WebSpeech | llama.cpp | SpeechT5 | ✅ Possible |
| `speech-transformers-native` | WebSpeech | Server LLM | sherpa-onnx | ✅ Possible |
| `speech-transformers-transformers` | WebSpeech | Server LLM | SpeechT5 | ✅ Possible |
| `browser-native-native` | Browser Whisper | llama.cpp | sherpa-onnx | ✅ Possible |
| `browser-native-transformers` | Browser Whisper | llama.cpp | SpeechT5 | ✅ Possible |
| `browser-transformers-native` | Browser Whisper | Server LLM | sherpa-onnx | ✅ Possible |
| `browser-transformers-transformers` | Browser Whisper | Server LLM | SpeechT5 | ✅ Possible |

### Hybrid: Server STT + Server LLM + Local TTS (8 combinations)

| Config | STT | LLM | TTS | Status |
|--------|-----|-----|-----|--------|
| `native-native-speech` | whisper.cpp | llama.cpp | WebSpeech | ✅ Possible |
| `native-transformers-speech` | whisper.cpp | Server LLM | WebSpeech | ✅ Example |
| `transformers-native-speech` | Server Whisper | llama.cpp | WebSpeech | ✅ Possible |
| `transformers-transformers-speech` | Server Whisper | Server LLM | WebSpeech | ✅ Example |
| `native-native-browser` | whisper.cpp | llama.cpp | Browser TTS | ⚠️ No browser TTS model |
| `native-transformers-browser` | whisper.cpp | Server LLM | Browser TTS | ⚠️ No browser TTS model |
| `transformers-native-browser` | Server Whisper | llama.cpp | Browser TTS | ⚠️ No browser TTS model |
| `transformers-transformers-browser` | Server Whisper | Server LLM | Browser TTS | ⚠️ No browser TTS model |

### Summary

- **36 total** configurations
- **26 currently possible** (✅)
- **10 waiting on browser TTS model** (⚠️)
- **7 examples** provided

## Server Ports

| Example | Port |
|---------|------|
| `transformers-transformers-transformers` | 3100 |
| `native-native-native` | 3101 |
| `native-transformers-speech` | 3102 |
| `transformers-transformers-speech` | 3103 |
| `speech-native-speech` | 3104 |

## Prerequisites

### For Local Examples (no server needed)
- Modern browser with WebGPU support (Chrome 113+, Edge 113+)
- Microphone access

### For Native Server Examples
```bash
# macOS
brew install whisper-cpp llama.cpp

# Download models
npx voice-pipeline setup
```

### For Transformers.js Server Examples
No additional setup needed - models download automatically on first run.

