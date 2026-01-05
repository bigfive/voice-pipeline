/**
 * Server Example - Native Backends (whisper.cpp, llama.cpp, sherpa-onnx)
 *
 * Full remote mode: STT → LLM → TTS
 * Client sends audio, server returns audio.
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline } from 'voice-pipeline';
import { NativeWhisperSTT, NativeLlama, NativeSherpaOnnxTTS, defaultPaths, getCacheDir } from 'voice-pipeline/native';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3101;

// Use default paths from ~/.cache/voice-pipeline/
// Run `npx voice-pipeline setup` to download models and binaries
const CONFIG = {
  stt: {
    ...defaultPaths.whisper,
    language: 'en',
  },
  llm: {
    ...defaultPaths.llama,
    maxNewTokens: 140,
    temperature: 0.7,
    gpuLayers: 0,
  },
  tts: {
    ...defaultPaths.sherpaOnnxTts,
  },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

async function main(): Promise<void> {
  console.log('Initializing native pipelines...');
  console.log(`  Cache:        ${getCacheDir()}`);
  console.log(`  Whisper:      ${CONFIG.stt.binaryPath}`);
  console.log(`  Llama:        ${CONFIG.llm.binaryPath}`);
  console.log(`  Sherpa-ONNX:  ${CONFIG.tts.binaryPath}`);

  const pipeline = new VoicePipeline({
    stt: new NativeWhisperSTT(CONFIG.stt),
    llm: new NativeLlama(CONFIG.llm),
    tts: new NativeSherpaOnnxTTS(CONFIG.tts),
    systemPrompt: CONFIG.systemPrompt,
  });

  await pipeline.initialize();
  console.log('Native pipelines ready.');

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
