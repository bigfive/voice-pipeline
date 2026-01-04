/**
 * Voice Assistant Server - Entry Point
 * Composition root that wires up all dependencies
 */

import { config } from './config';
import { HttpServer } from './infrastructure/http-server';
import { WebSocketServerWrapper } from './infrastructure/websocket-server';
import { WhisperSTTPipeline } from './pipelines/stt-pipeline';
import { GemmaLLMPipeline } from './pipelines/llm-pipeline';
import { SpeechT5Pipeline } from './pipelines/tts-pipeline';
import { ConversationService } from './services/conversation-service';
import { VoiceService } from './services/voice-service';
import { TextNormalizer } from './services/text-normalizer';
import { VoiceHandler } from './handlers/voice-handler';

async function main(): Promise<void> {
  console.log('Initializing voice assistant server...');
  console.log(`Configuration: port=${config.port}`);

  // 1. Create pipelines
  const sttPipeline = new WhisperSTTPipeline(config.stt);
  const llmPipeline = new GemmaLLMPipeline(config.llm);
  const ttsPipeline = new SpeechT5Pipeline(config.tts);

  // 2. Initialize pipelines (load models)
  await Promise.all([
    sttPipeline.initialize(),
    llmPipeline.initialize(),
    ttsPipeline.initialize(),
  ]);

  // 3. Create services
  const textNormalizer = new TextNormalizer();
  const conversationService = new ConversationService(config.llm.systemPrompt);
  const voiceService = new VoiceService(
    sttPipeline,
    llmPipeline,
    ttsPipeline,
    textNormalizer,
    conversationService
  );

  // 4. Create handler
  const voiceHandler = new VoiceHandler(voiceService, conversationService);

  // 5. Create infrastructure
  const httpServer = new HttpServer({ port: config.port });
  const wsServer = new WebSocketServerWrapper(
    httpServer.getServer(),
    voiceHandler
  );

  // Wire handler to WebSocket server
  voiceHandler.setWebSocketServer(wsServer);

  // 6. Start listening
  await httpServer.listen();

  console.log(`Voice assistant server running on ws://localhost:${config.port}`);
  console.log('All models loaded from Transformers.js - fully local!');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    wsServer.closeAll();
    await httpServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    wsServer.closeAll();
    await httpServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
