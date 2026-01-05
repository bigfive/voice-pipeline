/**
 * Server Example - Native STT/TTS with OpenAI LLM
 *
 * Full remote mode: STT → LLM → TTS all on server
 * - STT: whisper.cpp (native binary)
 * - LLM: OpenAI API (gpt-5-nano)
 * - TTS: sherpa-onnx (native binary)
 *
 * Client sends audio, server returns audio.
 *
 * Environment:
 *   OPENAI_API_KEY - OpenAI API key (required)
 *
 * Run: npm run example9
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline } from 'voice-pipeline';
import { NativeWhisperSTT, NativeSherpaOnnxTTS, defaultPaths, getCacheDir } from 'voice-pipeline/native';
import { CloudLLM } from 'voice-pipeline/cloud';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3106;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('  export OPENAI_API_KEY=sk-your-key-here');
  process.exit(1);
}

const CONFIG = {
  stt: {
    ...defaultPaths.whisper,
    language: 'en',
  },
  llm: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: OPENAI_API_KEY,
    model: 'gpt-5-nano',
    maxTokens: 256,
    temperature: 0.7,
  },
  tts: {
    ...defaultPaths.sherpaOnnxTts,
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Initializing native STT/TTS + OpenAI LLM pipeline...');
  console.log(`  Cache:        ${getCacheDir()}`);
  console.log(`  Whisper:      ${CONFIG.stt.binaryPath}`);
  console.log(`  OpenAI LLM:   ${CONFIG.llm.model}`);
  console.log(`  Sherpa-ONNX:  ${CONFIG.tts.binaryPath}`);

  const pipeline = new VoicePipeline({
    stt: new NativeWhisperSTT(CONFIG.stt),
    llm: new CloudLLM(CONFIG.llm),
    tts: new NativeSherpaOnnxTTS(CONFIG.tts),
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Pipeline ready.');

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

        // Log capabilities when received
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
  console.log('Full server-side processing: Audio → whisper.cpp → OpenAI → sherpa-onnx → Audio');
}

main().catch(console.error);

