/**
 * Server Example - Native Backends (whisper.cpp, llama.cpp, sherpa-onnx)
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { VoicePipeline } from '../../lib';
import { NativeWhisperPipeline, NativeLlamaPipeline, NativeSherpaOnnxTTSPipeline } from '../../lib/backends/native';
import type { ClientMessage, ServerMessage } from './protocol';

const PORT = 8081;

// Configure paths to native binaries and models
const CONFIG = {
  stt: {
    binaryPath: './bin/whisper-cli',
    modelPath: './models/whisper-large-v3-turbo-q8.bin',
    language: 'en',
  },
  llm: {
    binaryPath: './bin/llama-simple',
    modelPath: './models/smollm2-1.7b-instruct-q4_k_m.gguf',
    maxNewTokens: 140,
    temperature: 0.7,
    gpuLayers: 0,
  },
  tts: {
    binaryPath: './bin/sherpa-onnx-offline-tts',
    modelDir: './models/vits-piper-en_US-lessac-medium',
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

// ============ Audio Buffer ============

// Store Float32Array chunks directly to avoid Buffer alignment issues
const clientBuffers = new Map<WebSocket, Float32Array[]>();

function float32ToBase64(audio: Float32Array): string {
  // Copy to ensure we have a clean buffer
  const buffer = Buffer.alloc(audio.length * 4);
  for (let i = 0; i < audio.length; i++) {
    buffer.writeFloatLE(audio[i], i * 4);
  }
  return buffer.toString('base64');
}

function base64ToFloat32(data: string): Float32Array {
  const buffer = Buffer.from(data, 'base64');
  const float32 = new Float32Array(buffer.length / 4);
  for (let i = 0; i < float32.length; i++) {
    float32[i] = buffer.readFloatLE(i * 4);
  }
  return float32;
}

function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ============ WebSocket Handlers ============

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handleEndAudio(ws: WebSocket, pipeline: VoicePipeline): Promise<void> {
  const chunks = clientBuffers.get(ws) || [];
  clientBuffers.set(ws, []);

  if (chunks.length === 0) return;

  const audio = concatFloat32Arrays(chunks);

  await pipeline.processAudio(audio, {
    onTranscript: (text) => send(ws, { type: 'transcript', text }),
    onResponseChunk: (text) => send(ws, { type: 'response_chunk', text }),
    onAudio: (audio, sampleRate) => send(ws, { type: 'audio', data: float32ToBase64(audio), sampleRate }),
    onComplete: () => send(ws, { type: 'complete' }),
    onError: (err) => send(ws, { type: 'error', message: err.message }),
  });
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('Initializing native pipelines...');
  console.log(`  Whisper:      ${CONFIG.stt.binaryPath}`);
  console.log(`  Llama:        ${CONFIG.llm.binaryPath}`);
  console.log(`  Sherpa-ONNX:  ${CONFIG.tts.binaryPath}`);

  const stt = new NativeWhisperPipeline(CONFIG.stt);
  const llm = new NativeLlamaPipeline(CONFIG.llm);
  const tts = new NativeSherpaOnnxTTSPipeline(CONFIG.tts);

  const pipeline = new VoicePipeline({ stt, llm, tts, systemPrompt: CONFIG.systemPrompt });
  await pipeline.initialize();

  console.log('Native pipelines ready.');

  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    clientBuffers.set(ws, []);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;

        if (msg.type === 'audio') {
          const audioChunk = base64ToFloat32(msg.data);
          clientBuffers.get(ws)?.push(audioChunk);
        } else if (msg.type === 'end_audio') {
          await handleEndAudio(ws, pipeline);
        } else if (msg.type === 'clear_history') {
          pipeline.clearHistory();
        }
      } catch (err) {
        console.error('Message error:', err);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      clientBuffers.delete(ws);
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running on ws://localhost:${PORT}`);
  });
}

main().catch(console.error);

