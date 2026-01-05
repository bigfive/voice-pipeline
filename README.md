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

/bin/                           # Native binaries (created by npm run setup)
  whisper-cli                   # → symlink to Homebrew
  llama-cli                     # → symlink to Homebrew
  sherpa-onnx-offline-tts       # → downloaded binary

/models/                        # Model files (created by npm run setup)
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

Requires native binaries: whisper.cpp, llama.cpp, sherpa-onnx. See [Installing Native Backends](#installing-native-backends) below.

```bash
# Terminal 1: Start server
npm run dev:server-native

# Terminal 2: Start client
npm run dev
# Open http://localhost:5173/examples/server-native/
```

You can override default paths with environment variables:

```bash
export WHISPER_PATH=./bin/whisper-cli
export WHISPER_MODEL=./models/whisper-large-v3-turbo-q8.bin
export LLAMA_PATH=./bin/llama-cli
export LLAMA_MODEL=./models/smollm2-1.7b-instruct-q4_k_m.gguf
export SHERPA_ONNX_TTS_PATH=./bin/sherpa-onnx-offline-tts
export SHERPA_ONNX_TTS_MODEL=./models/vits-piper-en_US-lessac-medium
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
import { NativeWhisperPipeline, NativeLlamaPipeline, NativeSherpaOnnxTTSPipeline } from './lib/backends/native';

const stt = new NativeWhisperPipeline({
  binaryPath: './bin/whisper-cli',
  modelPath: './models/whisper-large-v3-turbo-q8.bin',
  language: 'en',
});

const llm = new NativeLlamaPipeline({
  binaryPath: './bin/llama-cli',
  modelPath: './models/smollm2-1.7b-instruct-q4_k_m.gguf',
  maxNewTokens: 140,
  temperature: 0.7,
});

const tts = new NativeSherpaOnnxTTSPipeline({
  binaryPath: './bin/sherpa-onnx-offline-tts',
  modelDir: './models/vits-piper-en_US-lessac-medium',
});

const pipeline = new VoicePipeline({ stt, llm, tts, systemPrompt: '...' });
```

### Installing Native Backends

```bash
# 1. Install STT and LLM via Homebrew
brew install whisper-cpp llama.cpp

# 2. Download models and setup binaries
npm run setup
```

This sets up:
- `bin/whisper-cli` → symlink to Homebrew whisper-cpp
- `bin/llama-cli` → symlink to Homebrew llama.cpp
- `bin/sherpa-onnx-offline-tts` → downloaded binary
- `models/whisper-large-v3-turbo-q8.bin` → Whisper model
- `models/smollm2-1.7b-instruct-q4_k_m.gguf` → LLM model
- `models/vits-piper-en_US-lessac-medium/` → TTS model

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
| STT | whisper.cpp | whisper-large-v3-turbo-q8.bin |
| LLM | llama.cpp | smollm2-1.7b-instruct.Q4_K_M.gguf |
| TTS | sherpa-onnx | vits-piper-en_US-lessac-medium/ |

## License

MIT
