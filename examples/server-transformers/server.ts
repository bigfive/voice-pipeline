/**
 * Server Example - Transformers.js Backend
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  VoicePipeline,
  WhisperSTTPipeline,
  SmolLMPipeline,
  SpeechT5Pipeline,
} from '../../lib';
import type { ClientMessage, ServerMessage } from './protocol';

const PORT = 8080;

const CONFIG = {
  stt: { model: 'Xenova/whisper-small', dtype: 'q8', language: 'en' },
  llm: { model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4', maxNewTokens: 140, temperature: 0.7 },
  tts: { model: 'Xenova/speecht5_tts', dtype: 'fp16', speakerEmbeddings: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin' },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

// ============ Audio Buffer ============

const clientBuffers = new Map<WebSocket, Buffer[]>();

function float32ToBase64(audio: Float32Array): string {
  return Buffer.from(audio.buffer).toString('base64');
}

function base64ToFloat32(data: string): Float32Array {
  const buffer = Buffer.from(data, 'base64');
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function pcmBufferToFloat32(buffer: Buffer): Float32Array {
  const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
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

  const fullBuffer = Buffer.concat(chunks);
  const audio = pcmBufferToFloat32(fullBuffer);

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
  console.log('Loading models...');

  const stt = new WhisperSTTPipeline(CONFIG.stt);
  const llm = new SmolLMPipeline(CONFIG.llm);
  const tts = new SpeechT5Pipeline(CONFIG.tts);

  const pipeline = new VoicePipeline({ stt, llm, tts, systemPrompt: CONFIG.systemPrompt });
  await pipeline.initialize();

  console.log('Models loaded.');

  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    clientBuffers.set(ws, []);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;

        if (msg.type === 'audio') {
          const buffer = Buffer.from(base64ToFloat32(msg.data).buffer);
          clientBuffers.get(ws)?.push(buffer);
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

