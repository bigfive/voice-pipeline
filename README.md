# Voice Pipeline

A flexible TypeScript library for building AI voice assistants that actually work the way you need them to.

## Why This Exists

Building a voice assistant involves three steps: **Speech-to-Text** (STT), **Language Model** (LLM), and **Text-to-Speech** (TTS). Most solutions force you into one of two boxes:

1. **Fully cloud-based** — send audio to APIs, get audio back. Simple, but adds latency, costs money per request, and requires internet.
2. **Fully local** — run everything on-device. Private and offline, but heavyweight and limited to smaller models.

**Voice Pipeline takes a different approach**: you choose where each component runs. Mix browser-native speech APIs with a server-side LLM. Run a small TTS model locally but transcribe on the server. Or go fully local when you need offline support. The architecture adapts to your requirements rather than the other way around.

## How It Works

From your perspective as a developer, there's one client SDK (`VoiceClient`) that handles everything:

```
User speaks → [STT] → [LLM] → [TTS] → User hears response
              ↑         ↑        ↑
          (browser   (browser  (browser
           or         or        or
           server)    server)   server)
```

You configure which components run locally and which run on a server. The client handles all the coordination automatically — sending audio or text over WebSocket when needed, managing the pipeline flow, and providing events for transcripts and streaming responses.

**Three modes emerge naturally:**

| Mode | When to Use | What Happens |
|------|-------------|--------------|
| **Local** | Offline apps, privacy-critical, demos | Everything runs in browser. No server needed. |
| **Remote** | Production apps with powerful models | Client sends audio, server handles all processing, sends back audio. |
| **Hybrid** | Low-latency with powerful LLMs | Browser handles instant STT/TTS, server runs the big model. |

The same push-to-talk interface works regardless of mode:

```typescript
await client.connect();
button.onmousedown = () => client.startRecording();
button.onmouseup = () => client.stopRecording();
```

Events fire for transcripts, streaming response chunks, and status changes — your UI code stays the same whether you're running a 360M parameter model in-browser or hitting a server with a much larger one.

## Installation

```bash
npm install voice-pipeline
```

## Quick Start

### 1. Fully Local (No Server)

Everything runs in the browser - no server required!

```typescript
import { createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';
import { SmolLM } from 'voice-pipeline';

const client = createVoiceClient({
  stt: new WebSpeechSTT({ language: 'en-US' }),
  llm: new SmolLM({
    model: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    dtype: 'q4',
    maxNewTokens: 140,
    device: 'webgpu',
  }),
  tts: new WebSpeechTTS({ voiceName: 'Samantha' }),
  systemPrompt: 'You are a helpful voice assistant.',
  // Note: no serverUrl needed!
});

client.on('transcript', (text) => console.log('You:', text));
client.on('responseChunk', (chunk) => console.log('Assistant:', chunk));

await client.connect();

button.onmousedown = () => client.startRecording();
button.onmouseup = () => client.stopRecording();
```

### 2. Fully Remote (Server)

Client sends audio, server handles everything:

**Client:**
```typescript
import { createVoiceClient } from 'voice-pipeline/client';

const client = createVoiceClient({
  stt: null,   // server handles
  llm: null,   // server handles
  tts: null,   // server handles
  serverUrl: 'ws://localhost:3100',
});
```

**Server:**
```typescript
import { WebSocketServer } from 'ws';
import { VoicePipeline, WhisperSTT, SmolLM, SpeechT5TTS } from 'voice-pipeline';
import { createPipelineHandler } from 'voice-pipeline/server';

const pipeline = new VoicePipeline({
  stt: new WhisperSTT({ model: 'Xenova/whisper-small', dtype: 'q8' }),
  llm: new SmolLM({ model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4' }),
  tts: new SpeechT5TTS({ model: 'Xenova/speecht5_tts', dtype: 'fp16', speakerEmbeddings: '...' }),
  systemPrompt: 'You are a helpful voice assistant.',
});

await pipeline.initialize();

const handler = createPipelineHandler(pipeline);
const wss = new WebSocketServer({ port: 3100 });

wss.on('connection', (ws) => {
  const session = handler.createSession();
  ws.on('message', async (data) => {
    for await (const msg of session.handle(JSON.parse(data.toString()))) {
      ws.send(JSON.stringify(msg));
    }
  });
  ws.on('close', () => session.destroy());
});
```

### 3. Hybrid (Browser STT/TTS + Server LLM)

Best of both worlds: instant browser speech APIs + powerful server models.

**Client:**
```typescript
import { createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';

const client = createVoiceClient({
  stt: new WebSpeechSTT({ language: 'en-US' }),  // local
  llm: null,                                      // server
  tts: new WebSpeechTTS({ voiceName: 'Samantha' }), // local
  serverUrl: 'ws://localhost:3100',
});
```

**Server:**
```typescript
import { VoicePipeline } from 'voice-pipeline';
import { NativeLlama } from 'voice-pipeline/native';

// Server only needs LLM - client handles STT/TTS
const pipeline = new VoicePipeline({
  stt: null,                    // client sends text
  llm: new NativeLlama({ ... }),
  tts: null,                    // client receives text
  systemPrompt: '...',
});
```

## API Reference

### Exports

```typescript
// Main library - pipeline + Transformers.js backends
import { VoicePipeline, WhisperSTT, SmolLM, SpeechT5TTS } from 'voice-pipeline';

// Client SDK - unified browser interface
import {
  createVoiceClient,
  VoiceClient,
  WebSpeechSTT,
  WebSpeechTTS
} from 'voice-pipeline/client';

// Server utilities - WebSocket handler
import { createPipelineHandler } from 'voice-pipeline/server';

// Native backends (server-only)
import {
  NativeWhisperSTT,
  NativeLlama,
  NativeSherpaOnnxTTS,
  defaultPaths,
  getCacheDir
} from 'voice-pipeline/native';
```

### VoiceClient

```typescript
const client = createVoiceClient({
  // Components: provide locally, or null for server
  stt: STTPipeline | WebSpeechSTT | null,
  llm: LLMPipeline | null,
  tts: TTSPipeline | WebSpeechTTS | null,

  // Required if any component is null
  serverUrl: 'ws://localhost:3100',

  // Required if llm is provided locally
  systemPrompt: 'You are a helpful assistant.',

  // Optional
  sampleRate: 16000,
  autoReconnect: true,
  reconnectDelay: 2000,
});

// Events
client.on('status', (status) => {
  // 'disconnected' | 'connecting' | 'initializing' | 'ready' | 'listening' | 'processing' | 'speaking'
});
client.on('transcript', (text) => { /* user's speech */ });
client.on('responseChunk', (chunk) => { /* streaming LLM token */ });
client.on('responseComplete', (fullText) => { /* complete response */ });
client.on('progress', ({ status, file, progress }) => { /* model loading */ });
client.on('error', (err) => { /* Error */ });

// Methods
await client.connect();          // Initialize local components + connect to server
await client.startRecording();   // Start listening
await client.stopRecording();    // Stop and process
client.clearHistory();           // Reset conversation
client.getMode();                // 'local' | 'remote' | 'hybrid'
client.getLocalComponents();     // { stt: boolean, llm: boolean, tts: boolean }
client.isReady();
client.isRecording();
client.disconnect();
await client.dispose();
```

### VoicePipeline

```typescript
const pipeline = new VoicePipeline({
  stt: STTPipeline | null,    // null if client handles STT
  llm: LLMPipeline,           // required
  tts: TTSPipeline | null,    // null if client handles TTS
  systemPrompt: string,
});

await pipeline.initialize();

// Process audio (requires STT)
await pipeline.processAudio(audioFloat32Array, {
  onTranscript: (text) => {},
  onResponseChunk: (chunk) => {},
  onAudio: (playable) => {},
  onComplete: () => {},
  onError: (err) => {},
});

// Process text (for when client does STT)
await pipeline.processText('Hello', callbacks);

pipeline.hasSTT();
pipeline.hasTTS();
pipeline.clearHistory();
```

## Examples

See the [examples/](./examples/) directory for 7 interactive examples covering all configuration modes.

```bash
cd examples
npm install
npm run example1  # Or example2, example3, etc.
```

## Installing Native Backends

```bash
# macOS
brew install whisper-cpp llama.cpp

# Download models
npx voice-pipeline setup
```

## Project Structure

```
voice-pipeline/
├── src/
│   ├── backends/
│   │   ├── transformers/     # WhisperSTT, SmolLM, SpeechT5TTS
│   │   └── native/           # NativeWhisperSTT, NativeLlama, NativeSherpaOnnxTTS
│   ├── client/
│   │   ├── voice-client.ts   # Unified browser SDK
│   │   ├── web-speech-stt.ts # Browser Speech Recognition
│   │   └── web-speech-tts.ts # Browser Speech Synthesis
│   ├── server/
│   │   └── handler.ts        # WebSocket handler (capability-aware)
│   └── voice-pipeline.ts     # Core orchestrator
└── examples/                  # See examples/README.md
```

## Advanced: Capability Detection

The server supports automatic capability detection for scenarios where you need one server to handle multiple client types (e.g., during rolling deployments).

```typescript
import { VoicePipeline } from 'voice-pipeline';
import { NativeWhisperSTT, NativeLlama, NativeSherpaOnnxTTS } from 'voice-pipeline/native';

// Server with full pipeline - adapts to client capabilities
const pipeline = new VoicePipeline({
  stt: new NativeWhisperSTT({ ... }),  // used if client sends audio
  llm: new NativeLlama({ ... }),
  tts: new NativeSherpaOnnxTTS({ ... }), // skipped if client has local TTS
  systemPrompt: '...',
});
```

When a client connects, it announces its capabilities. The server then:
- Skips STT if client sends text instead of audio
- Skips TTS if client handles speech synthesis locally

This is useful for zero-downtime upgrades where old and new clients coexist, but for most cases you should just configure the server with exactly what it needs (using `null` for components the client handles).

## License

MIT
