# Voice Pipeline

Build voice assistants without the plumbing. One SDK, any backend, same interface.

```typescript
const client = createVoiceClient({
  stt: new WebSpeechSTT(),
  llm: new TransformersLLM({ model: 'HuggingFaceTB/SmolLM2-360M-Instruct' }),
  tts: new WebSpeechTTS(),
  systemPrompt: 'You are a helpful assistant.',
});

await client.connect();
button.onmousedown = () => client.startRecording();
button.onmouseup = () => client.stopRecording();
```

That's a working voice assistant. No audio capture code, no streaming logic, no WebSocket boilerplate.

**The trick:** each slot (STT, LLM, TTS) can run in the browser or on a server — swap `WebSpeechSTT()` for `null` and it runs server-side. Same API, same events, different backends.

```
User speaks → [STT] → [LLM] → [TTS] → User hears response
              ↑         ↑        ↑
           browser   browser   browser   ← fully local
           server    server    server    ← fully remote
           browser   server    browser   ← hybrid
```

**What you can mix:**
- **Browser:** Web Speech APIs (zero install), Transformers.js (WebGPU)
- **Server:** Transformers.js (Node.js), whisper.cpp, llama.cpp, sherpa-onnx (native)
- **Cloud:** OpenAI, Ollama, vLLM, any OpenAI-compatible endpoint

## Installation

```bash
npm install voice-pipeline
```

## Quick Start

### 1. Fully Local (No Server)

Everything runs in the browser - no server required!

```typescript
import { createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';
import { TransformersLLM } from 'voice-pipeline';

const client = createVoiceClient({
  stt: new WebSpeechSTT({ language: 'en-US' }),
  llm: new TransformersLLM({
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
import { VoicePipeline, WhisperSTT, TransformersLLM, SpeechT5TTS } from 'voice-pipeline';
import { createPipelineHandler } from 'voice-pipeline/server';

const pipeline = new VoicePipeline({
  stt: new WhisperSTT({ model: 'Xenova/whisper-small', dtype: 'q8' }),
  llm: new TransformersLLM({ model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4' }),
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

### 3. Cloud LLM (OpenAI, Ollama, vLLM)

Server handles all audio processing, proxies to cloud for intelligence. Best of both worlds: consistent speech quality + best-in-class LLMs.

**Client:**
```typescript
import { createVoiceClient } from 'voice-pipeline/client';

const client = createVoiceClient({
  stt: null,   // server handles
  llm: null,   // server proxies to cloud
  tts: null,   // server handles
  serverUrl: 'ws://localhost:3100',
});
```

**Server:**
```typescript
import { VoicePipeline } from 'voice-pipeline';
import { NativeWhisperSTT, NativeSherpaOnnxTTS } from 'voice-pipeline/native';
import { CloudLLM } from 'voice-pipeline/cloud';

const pipeline = new VoicePipeline({
  stt: new NativeWhisperSTT({ model: 'base.en' }),
  llm: new CloudLLM({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    maxTokens: 256,
  }),
  tts: new NativeSherpaOnnxTTS({ model: 'en_US-amy-medium' }),
  systemPrompt: 'You are a helpful voice assistant.',
});
```

Works with **OpenAI**, **Ollama** (`http://localhost:11434/v1`), **vLLM**, **LMStudio**, and any OpenAI-compatible endpoint.

### 4. Hybrid (Browser STT/TTS + Server LLM)

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
import { VoicePipeline, WhisperSTT, TransformersLLM, SpeechT5TTS } from 'voice-pipeline';

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

// Cloud backends (server-only)
import { CloudLLM } from 'voice-pipeline/cloud';
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

### Tools (Function Calling)

Give your voice assistant the ability to take actions — check the weather, control smart home devices, query databases, or call any API.

**Defining a tool:**

```typescript
import { Tool } from 'voice-pipeline';

const getWeather: Tool = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, e.g., "San Francisco"',
      },
    },
    required: ['location'],
  },
  execute: async (args) => {
    const location = args.location as string;
    // Call your weather API here
    return { location, temperature: '72°F', condition: 'sunny' };
  },
};
```

**Using tools with VoicePipeline:**

```typescript
const pipeline = new VoicePipeline({
  llm: new CloudLLM({ ... }),
  systemPrompt: 'You are a helpful assistant.',
  tools: [getWeather, getTime, rollDice],
});
```

**Tool events** (via callbacks):

```typescript
await pipeline.processText('What\'s the weather in Tokyo?', {
  onToolCall: (call) => console.log(`Calling ${call.name}...`),
  onToolResult: (id, result) => console.log('Result:', result),
  onResponseChunk: (chunk) => console.log(chunk),
  // ... other callbacks
});
```

**Backend support:**

All LLM backends support tools with the same API:

| Backend | How Tools Work |
|---------|----------------|
| `CloudLLM` | Native OpenAI function calling API |
| `NativeLlama` | Prompt injection (instructions added to system prompt) |
| `TransformersLLM` (Transformers.js) | Prompt injection (instructions added to system prompt) |

You don't need to do anything different — just pass `tools` and the backend handles it.

**Complete example:**

```typescript
import { VoicePipeline, Tool } from 'voice-pipeline';
import { CloudLLM } from 'voice-pipeline/cloud';

const tools: Tool[] = [
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
    }),
  },
  {
    name: 'roll_dice',
    description: 'Roll dice, e.g., "2d6" for two six-sided dice',
    parameters: {
      type: 'object',
      properties: {
        notation: { type: 'string', description: 'Dice notation like "2d6"' },
      },
      required: ['notation'],
    },
    execute: async (args) => {
      const [num, sides] = (args.notation as string).split('d').map(Number);
      const rolls = Array.from({ length: num }, () => Math.floor(Math.random() * sides) + 1);
      return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
    },
  },
];

const pipeline = new VoicePipeline({
  llm: new CloudLLM({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
  }),
  systemPrompt: 'You are a helpful assistant. Use tools when needed.',
  tools,
});
```

See `examples/example-5` and `examples/example-8` for full working examples with tools.

## Examples

See the [examples/](./examples/) directory for 9 interactive examples covering all configuration modes, including cloud LLM integration.

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

## Cloud LLM Setup

For OpenAI:
```bash
export OPENAI_API_KEY=sk-your-key-here
```

For Ollama (runs locally, no API key needed):
```bash
brew install ollama
ollama pull llama3.2
# Use baseUrl: 'http://localhost:11434/v1'
```

## Project Structure

```
voice-pipeline/
├── src/
│   ├── backends/
│   │   ├── transformers/     # WhisperSTT, TransformersLLM, SpeechT5TTS
│   │   ├── native/           # NativeWhisperSTT, NativeLlama, NativeSherpaOnnxTTS
│   │   └── cloud/            # CloudLLM (OpenAI, Ollama, vLLM)
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
