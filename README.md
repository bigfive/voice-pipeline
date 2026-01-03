# Push-to-Talk Voice Assistant

A browser-based voice assistant using WebGPU/WASM for local STT and TTS processing.

## Stack

- **STT**: [Moonshine](https://huggingface.co/onnx-community/moonshine-tiny-ONNX) (runs in browser via WebGPU)
- **LLM**: [Ollama](https://ollama.ai) (localhost:11434)
- **TTS**: [Kitten TTS Nano](https://github.com/clowerweb/kitten-tts-web-demo) (~24MB, 15M params, runs in browser)

## Requirements

- Modern browser with WebAssembly support (all modern browsers)
- Ollama running locally with a model installed
- Node.js 18+ for development

## Setup

1. **Install Ollama and pull a model:**
   ```bash
   # Install Ollama from https://ollama.ai
   ollama pull qwen3:14b  # or any other model
   ollama serve
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the dev server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to http://localhost:5173

## Usage

- **Click and hold** the "Hold to Talk" button to record
- **Release** to process and get a response
- **Spacebar** also works as push-to-talk

## Configuration

Edit `src/voice-assistant.ts` to change:

```typescript
const CONFIG = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "qwen3:14b",  // Change to your model
  },
  stt: {
    modelId: "onnx-community/moonshine-tiny-ONNX",
    device: "webgpu",  // or "wasm" for fallback
  },
  tts: {
    voice: "expr-voice-2-f",  // See available voices below
    speed: 1.0,               // 0.5 to 2.0
    device: "webgpu",         // or "wasm"
  },
};
```

### Available Kitten TTS Voices

| Voice ID | Description |
|----------|-------------|
| `expr-voice-1-m` | Male voice 1 |
| `expr-voice-1-f` | Female voice 1 |
| `expr-voice-2-m` | Male voice 2 |
| `expr-voice-2-f` | Female voice 2 |
| `expr-voice-3-m` | Male voice 3 |
| `expr-voice-3-f` | Female voice 3 |
| `expr-voice-4-m` | Male voice 4 |
| `expr-voice-4-f` | Female voice 4 |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Moonshine│    │  Ollama  │    │  Kitten  │      │
│  │   STT    │───▶│   LLM    │───▶│   TTS    │      │
│  │ (WebGPU) │    │  (HTTP)  │    │(WebGPU/W)│      │
│  └──────────┘    └──────────┘    └──────────┘      │
│       ▲                               │            │
│       │         Audio Pipeline        ▼            │
│  ┌─────────┐                    ┌─────────┐        │
│  │   Mic   │                    │ Speaker │        │
│  └─────────┘                    └─────────┘        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Ollama Server   │
              │  localhost:11434 │
              └──────────────────┘
```

## Features

- **Push-to-talk UI** - Hold button to record, release to process
- **Streaming responses** - LLM response streams to TTS for low latency
- **WebGPU acceleration** - With automatic WASM fallback
- **Conversation history** - Maintains context across messages
- **Keyboard support** - Spacebar for hands-free operation
- **Tiny model** - Kitten TTS is only ~24MB (15M parameters)
- **8 voices** - Male and female expression voices

## First Load

On first load, the app downloads models from Hugging Face:
- Moonshine STT: ~40MB
- Kitten TTS: ~24MB

Models are cached in the browser for subsequent visits.

## Troubleshooting

### "Ollama not running"
Make sure Ollama is running:
```bash
ollama serve
```

### WebGPU not supported
Both STT and TTS will automatically fall back to WASM if WebGPU isn't available.

### CORS errors
Ollama should allow CORS by default. If not:
```bash
OLLAMA_ORIGINS="*" ollama serve
```

### Audio sounds distorted
Try switching to WASM mode in the config (`device: "wasm"`).

## Credits

- [Kitten TTS](https://github.com/clowerweb/kitten-tts-web-demo) - Lightweight browser TTS
- [Moonshine](https://huggingface.co/onnx-community/moonshine-tiny-ONNX) - Fast STT
- [phonemizer](https://www.npmjs.com/package/phonemizer) - Text to phoneme conversion

## Building for Production

```bash
npm run build
```

Output will be in `dist/` - serve with any static file server.
