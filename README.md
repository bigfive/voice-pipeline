# Voice Pipeline

Isomorphic STT → LLM → TTS pipeline library. Run voice assistants in the browser (WebGPU) or on a server (Transformers.js or native binaries).

## Structure

```
/lib/                           # The pipeline library
  /types.ts                     # All type definitions
  /backends/
    /transformers/              # Transformers.js (browser + Node.js)
    /native/                    # Native binaries (Node.js only)
  /services/
    function-service.ts         # Tool/function calling
    text-normalizer.ts          # TTS text normalization
  /voice-pipeline.ts            # Main orchestrator

/examples/
  /local-transformers/          # Browser-only (WebGPU)
  /server-transformers/         # Server + client (Transformers.js)
  /server-native/               # Server + client (native binaries)
```

## Quick Start

### Browser-Only Example

All inference runs in the browser via WebGPU:

```bash
npm install
npm run dev
# Open http://localhost:5173/examples/local-transformers/
```

### Server + Client (Transformers.js)

```bash
# Terminal 1: Start server
npm run dev:server-transformers

# Terminal 2: Start client
npm run dev
# Open http://localhost:5173/examples/server-transformers/
```

### Server + Client (Native)

Requires native binaries: whisper.cpp, llama.cpp, piper. See [Installing Native Backends](#installing-native-backends) below.

```bash
# Terminal 1: Start server
npm run dev:server-native

# Terminal 2: Start client
npm run dev
# Open http://localhost:5173/examples/server-native/
```

You can override default paths with environment variables:

```bash
export WHISPER_PATH=/opt/homebrew/bin/whisper-cli
export WHISPER_MODEL=./models/whisper-small.bin
export LLAMA_PATH=/opt/homebrew/bin/llama-cli
export LLAMA_MODEL=./models/smollm2-1.7b-instruct-q4_k_m.gguf
export PIPER_PATH=/usr/local/bin/piper/piper
export PIPER_MODEL=./models/en_US-lessac-medium.onnx
```

## Using the Library

```typescript
import {
  VoicePipeline,
  WhisperSTTPipeline,
  SmolLMPipeline,
  SpeechT5Pipeline,
} from './lib';

// Create pipelines
const stt = new WhisperSTTPipeline({ model: 'Xenova/whisper-tiny.en', dtype: 'q8' });
const llm = new SmolLMPipeline({ model: 'HuggingFaceTB/SmolLM2-360M-Instruct', dtype: 'q4', maxNewTokens: 140, temperature: 0.7 });
const tts = new SpeechT5Pipeline({ model: 'Xenova/speecht5_tts', dtype: 'q8', speakerEmbeddings: '...' });

// Create voice pipeline
const pipeline = new VoicePipeline({
  stt,
  llm,
  tts,
  systemPrompt: 'You are a helpful assistant.',
});

// Initialize (downloads models)
await pipeline.initialize();

// Process audio
await pipeline.processAudio(audioFloat32Array, {
  onTranscript: (text) => console.log('User said:', text),
  onResponseChunk: (chunk) => console.log('Response:', chunk),
  onAudio: (audio, sampleRate) => playAudio(audio, sampleRate),
  onComplete: () => console.log('Done'),
  onError: (err) => console.error(err),
});
```

## Native Backend (Server-Only)

Native backends must be imported separately (they use Node.js APIs):

```typescript
import { VoicePipeline } from './lib';
import { NativeWhisperPipeline, NativeLlamaPipeline, NativePiperPipeline } from './lib/backends/native';

const stt = new NativeWhisperPipeline({
  binaryPath: '/usr/local/bin/whisper-cpp',
  modelPath: './models/whisper-small.bin',
  language: 'en',
});

const llm = new NativeLlamaPipeline({
  binaryPath: '/usr/local/bin/llama-cli',
  modelPath: './models/smollm2-1.7b-instruct.Q4_K_M.gguf',
  maxNewTokens: 140,
  temperature: 0.7,
});

const tts = new NativePiperPipeline({
  binaryPath: '/usr/local/bin/piper',
  modelPath: './models/en_US-lessac-medium.onnx',
});

const pipeline = new VoicePipeline({ stt, llm, tts, systemPrompt: '...' });
```

### Installing Native Backends

**Install binaries:**

```bash
# whisper.cpp
brew install whisper-cpp

# llama.cpp
brew install llama.cpp

# piper
# download and extract from https://github.com/rhasspy/piper/releases
sudo mv piper /usr/local/bin/ # or ensure available in $PATH
```

**Download models:**

```bash
npm run download-models
```

## Models

### Transformers.js (Browser + Node.js)

| Component | Model | Size |
|-----------|-------|------|
| STT | Xenova/whisper-tiny.en | ~150MB |
| LLM | HuggingFaceTB/SmolLM2-360M-Instruct | ~400MB |
| TTS | Xenova/speecht5_tts | ~200MB |

### Native (Server-Only)

| Component | Binary | Model |
|-----------|--------|-------|
| STT | whisper.cpp | whisper-small.bin |
| LLM | llama.cpp | smollm2-1.7b-instruct.Q4_K_M.gguf |
| TTS | piper | en_US-lessac-medium.onnx |

## License

MIT
