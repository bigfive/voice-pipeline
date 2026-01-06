/**
 * Server Example - Transformers.js Backend
 *
 * Full remote mode: STT → LLM → TTS
 * Client sends audio, server returns audio.
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline, WhisperSTT, TransformersLLM, SpeechT5TTS } from 'voice-pipeline';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3100;

const CONFIG = {
  stt: { model: 'Xenova/whisper-small', dtype: 'q8', language: 'en' },
  llm: { model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', dtype: 'q4', maxNewTokens: 140, temperature: 0.7 },
  tts: { model: 'Xenova/speecht5_tts', dtype: 'fp16', speakerEmbeddings: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin' },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Loading Transformers.js models...');

  const pipeline = new VoicePipeline({
    stt: new WhisperSTT(CONFIG.stt),
    llm: new TransformersLLM(CONFIG.llm),
    tts: new SpeechT5TTS(CONFIG.tts),
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Models loaded.');

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
}

main().catch(console.error);
