# Voice Pipeline

Build voice assistants without the plumbing. One SDK, any backend, same interface.

Voice apps either need expensive multimodal models, or a pipeline of three pieces: speech-to-text, an LLM, text-to-speech. Wiring them together means audio capture code, streaming logic, WebSocket boilerplate. This library handles all of that.

```typescript
import { createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';
import { TransformersLLM } from 'voice-pipeline';

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

That's a working voice assistant. No server required. See [`examples/example-0-bare-bones`](./examples/example-0-bare-bones/index.html) for the complete 30-line HTML version.

## Mix and Match

Each component can run in the browser, on a server, or in the cloud. Pick any from each column — they all work together with the same API.

```
    ┌───────────────────────────┐       ┌───────────────────────────┐       ┌───────────────────────────┐
    │                           │       │                           │       │                           │
    │            STT            │ ────► │            LLM            │ ────► │            TTS            │
    │                           │       │                           │       │                           │
    └───────────────────────────┘       └───────────────────────────┘       └───────────────────────────┘

     🌐 Browser speech recognition              N/A                          🌐 Browser speech synthesis
        (Web Speech API)                                                         (Web Speech API)

     🌐 Browser JS transcriber           🌐 Browser JS LLM                    🌐 Browser JS synthesis
        (Transformers.js, WebGPU)           (Transformers.js, WebGPU)            (Transformers.js, WebGPU)

     🖥️ Server JS transcriber            🖥️ Server JS LLM                     🖥️ Server JS synthesis
        (Transformers.js, Node.js)          (Transformers.js, Node.js)           (Transformers.js, Node.js)

     🖥️ Server binary transcriber        🖥️ Server binary LLM                 🖥️ Server binary synthesis
        (whisper.cpp)                       (llama.cpp)                          (sherpa-onnx)

              N/A                         ☁️ Cloud LLM                               N/A
                                            (OpenAI, Ollama, vLLM)

```

Want browser speech recognition + a cloud LLM + browser speech synthesis? Done. Want everything running locally on your server with native binaries? Also done. Same code structure, same events, different backends.

## Features

- **Streaming** — responses stream token-by-token to TTS
- **Function calling** — tools work across all LLM backends (cloud, native, transformers)
- **Conversation history** — automatic context management
- **Hybrid configs** — mix browser and server components freely

See [`USAGE.md`](./USAGE.md) for full API documentation.

## Examples

See [`examples/`](./examples/) for 10 interactive demos covering all configurations.

```bash
cd examples
npm install
npm run example0  # or example1, example2, etc.
```

## Install

```bash
npm install voice-pipeline
```

For native backends (whisper.cpp, llama.cpp, sherpa-onnx):

```bash
# macOS
brew install whisper-cpp llama.cpp

# Download models
npx voice-pipeline setup
```

For cloud LLMs:

```bash
# OpenAI
export OPENAI_API_KEY=sk-your-key-here

# Or Ollama (local, no API key)
brew install ollama && ollama pull llama3.2
```

## License

MIT
