/**
 * Server for speech-native-speech Example
 *
 * Hybrid mode: Client handles STT and TTS, server only does LLM
 * - STT: Client (WebSpeech) - server receives text
 * - LLM: Native llama.cpp
 * - TTS: Client (WebSpeech) - server sends text only
 *
 * Run: npm run dev:speech-native
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline, defaultPaths, getCacheDir } from 'voice-pipeline';
import { NativeLlama } from 'voice-pipeline/native';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 8084;

const CONFIG = {
  llm: {
    ...defaultPaths.llama,
    maxNewTokens: 140,
    temperature: 0.7,
    gpuLayers: 0,
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Initializing LLM-only pipeline (client handles STT/TTS)...');
  console.log(`  Cache: ${getCacheDir()}`);
  console.log(`  Llama: ${CONFIG.llm.binaryPath}`);
  console.log(`  STT:   Client handles (WebSpeech)`);
  console.log(`  TTS:   Client handles (WebSpeech)`);

  // LLM-only pipeline - client handles STT and TTS
  const pipeline = new VoicePipeline({
    stt: null,  // Client does WebSpeech STT
    llm: new NativeLlama(CONFIG.llm),
    tts: null,  // Client does WebSpeech TTS
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('LLM pipeline ready.');

  const handler = createPipelineHandler(pipeline);
  const pipelineInfo = handler.getPipelineInfo();
  console.log(`Pipeline capabilities: STT=${pipelineInfo.hasSTT}, TTS=${pipelineInfo.hasTTS}`);

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
  console.log('This server only runs LLM - client handles STT and TTS with WebSpeech.');
  console.log('Only text is exchanged over the wire (no audio).');
}

main().catch(console.error);

