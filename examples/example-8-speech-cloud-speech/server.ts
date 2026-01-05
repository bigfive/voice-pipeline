/**
 * Server for speech-cloud-speech Example
 *
 * Hybrid mode: Client handles STT and TTS, server proxies to OpenAI
 * - STT: Client (WebSpeech) - server receives text
 * - LLM: OpenAI API (gpt-5-nano)
 * - TTS: Client (WebSpeech) - server sends text only
 *
 * Environment:
 *   OPENAI_API_KEY - OpenAI API key (required)
 *
 * Run: npm run example8
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline } from 'voice-pipeline';
import { CloudLLM } from 'voice-pipeline/cloud';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3105;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('  export OPENAI_API_KEY=sk-your-key-here');
  process.exit(1);
}

const CONFIG = {
  llm: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: OPENAI_API_KEY,
    model: 'gpt-5-nano',
    maxTokens: 256,
    temperature: 0.7,
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Initializing OpenAI LLM pipeline...');
  console.log(`  Model:  ${CONFIG.llm.model}`);
  console.log(`  STT:    Client handles (WebSpeech)`);
  console.log(`  TTS:    Client handles (WebSpeech)`);

  // LLM-only pipeline - client handles STT and TTS
  const pipeline = new VoicePipeline({
    stt: null,  // Client does WebSpeech STT
    llm: new CloudLLM(CONFIG.llm),
    tts: null,  // Client does WebSpeech TTS
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Cloud LLM pipeline ready.');

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
  console.log('This server proxies to OpenAI - client handles STT and TTS with WebSpeech.');
  console.log('Only text is exchanged over the wire (no audio).');
}

main().catch(console.error);

