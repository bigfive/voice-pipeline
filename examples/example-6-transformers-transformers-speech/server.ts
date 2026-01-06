/**
 * Server for transformers-transformers-speech Example
 *
 * Hybrid mode: Server handles STT and LLM, client handles TTS
 * - STT: Transformers.js Whisper (server)
 * - LLM: Transformers.js TransformersLLM (server)
 * - TTS: Client (WebSpeech) - server sends text only
 *
 * Run: npm run dev:transformers-speech
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline, WhisperSTT, TransformersLLM } from 'voice-pipeline';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3103;

const CONFIG = {
  stt: { model: 'Xenova/whisper-small', dtype: 'q8', language: 'en' },
  llm: { model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4', maxNewTokens: 140, temperature: 0.7 },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Loading Transformers.js models (STT + LLM only)...');
  console.log(`  STT: ${CONFIG.stt.model}`);
  console.log(`  LLM: ${CONFIG.llm.model}`);
  console.log(`  TTS: Client handles (WebSpeech)`);

  // STT + LLM pipeline - client handles TTS
  const pipeline = new VoicePipeline({
    stt: new WhisperSTT(CONFIG.stt),
    llm: new TransformersLLM(CONFIG.llm),
    tts: null,  // Client does WebSpeech TTS
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Models loaded.');

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
  console.log('This server handles STT and LLM - client handles TTS with WebSpeech.');
  console.log('Audio is sent to server, text is returned (no audio back).');
}

main().catch(console.error);

