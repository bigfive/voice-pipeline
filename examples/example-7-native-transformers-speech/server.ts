/**
 * Mixed Server Example - Native STT + Transformers.js LLM
 *
 * Demonstrates mixing backend types:
 * - STT: Native whisper.cpp (fast, high-quality)
 * - LLM: Transformers.js TransformersLLM (easier to set up)
 * - TTS: None (client handles with WebSpeech)
 *
 * Run: npm run dev:native-transformers
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline, TransformersLLM } from 'voice-pipeline';
import { NativeWhisperSTT, getBinaryPath, getModelPath, getCacheDir } from 'voice-pipeline/native';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3102;

// Model paths - must match models.json in this directory
// Run: npx voice-pipeline setup examples/example-7-native-transformers-speech/models.json
// Run: npx voice-pipeline setup --binaries-only
const CONFIG = {
  stt: {
    binaryPath: getBinaryPath('whisper-cli'),
    modelPath: getModelPath('whisper-large-v3-turbo-q8.bin'),
    language: 'en',
  },
  llm: {
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    dtype: 'q4',
    maxNewTokens: 140,
    temperature: 0.7,
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Initializing mixed pipeline (native STT + Transformers.js LLM)...');
  console.log(`  Cache:   ${getCacheDir()}`);
  console.log(`  Whisper: ${CONFIG.stt.binaryPath} (native)`);
  console.log(`  LLM:     ${CONFIG.llm.model} (Transformers.js)`);
  console.log(`  TTS:     Client handles (WebSpeech)`);

  // Mixed pipeline: native STT + Transformers.js LLM + no TTS (client handles)
  const pipeline = new VoicePipeline({
    stt: new NativeWhisperSTT(CONFIG.stt),
    llm: new TransformersLLM(CONFIG.llm),
    tts: null, // Client handles TTS with WebSpeech
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Mixed pipeline ready.');

  // Create the handler
  const handler = createPipelineHandler(pipeline);
  const pipelineInfo = handler.getPipelineInfo();
  console.log(`Pipeline capabilities: STT=${pipelineInfo.hasSTT}, TTS=${pipelineInfo.hasTTS}`);

  // Set up WebSocket server
  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    const session = handler.createSession();

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'capabilities') {
          const caps = session.getCapabilities();
          console.log(`Client capabilities: STT=${caps.hasSTT}, TTS=${caps.hasTTS}`);
        }

        for await (const response of session.handle(message)) {
          ws.send(JSON.stringify(response));
        }
      } catch (err) {
        console.error('Message error:', err);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      session.destroy();
    });
  });

  console.log(`Server running on ws://localhost:${PORT}`);
  console.log('');
  console.log('This example demonstrates mixing native + Transformers.js backends.');
  console.log('Client sends audio → whisper.cpp transcribes → TransformersLLM responds → Client speaks with WebSpeech');
}

main().catch(console.error);

