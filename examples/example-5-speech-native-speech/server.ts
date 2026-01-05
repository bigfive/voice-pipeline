/**
 * Server for speech-native-speech Example
 *
 * Hybrid mode: Client handles STT and TTS, server only does LLM
 * - STT: Client (WebSpeech) - server receives text
 * - LLM: Native llama.cpp with tool calling (prompt-based)
 * - TTS: Client (WebSpeech) - server sends text only
 *
 * Demonstrates tool/function calling with native LLM:
 * - get_current_time: Returns the current time
 * - get_weather: Returns mock weather for a location
 * - roll_dice: Rolls dice (e.g., "2d6")
 *
 * Note: Native LLM uses prompt-based tool calling since llama.cpp
 * doesn't have native function calling support.
 *
 * Run: npm run dev:speech-native
 */

import { WebSocketServer } from 'ws';
import { VoicePipeline, Tool } from 'voice-pipeline';
import { NativeLlama, defaultPaths, getCacheDir } from 'voice-pipeline/native';
import { createPipelineHandler } from 'voice-pipeline/server';

const PORT = 3104;

const CONFIG = {
  llm: {
    ...defaultPaths.llama,
    maxNewTokens: 200, // Increased for tool calling JSON
    temperature: 0.7,
    gpuLayers: 0,
  },
  systemPrompt: `You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.

You have tools available to help answer questions:
- Use get_current_time when asked about the time
- Use get_weather when asked about weather in a location  
- Use roll_dice when asked to roll dice for games`,
};

// ============ Tool Definitions ============

const tools: Tool[] = [
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const now = new Date();
      return {
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      };
    },
  },
  {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city name, e.g., "San Francisco" or "London"',
        },
      },
      required: ['location'],
    },
    execute: async (args) => {
      // Mock weather data - in real app, call a weather API
      const location = args.location as string;
      const conditions = ['sunny', 'partly cloudy', 'cloudy', 'rainy'];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const temp = Math.floor(Math.random() * 30) + 50; // 50-80°F
      
      return {
        location,
        temperature: `${temp}°F`,
        condition,
        humidity: `${Math.floor(Math.random() * 40) + 40}%`,
      };
    },
  },
  {
    name: 'roll_dice',
    description: 'Roll dice for games. Supports standard notation like "2d6" (two six-sided dice) or "1d20" (one twenty-sided die)',
    parameters: {
      type: 'object',
      properties: {
        notation: {
          type: 'string',
          description: 'Dice notation, e.g., "2d6", "1d20", "3d8"',
        },
      },
      required: ['notation'],
    },
    execute: async (args) => {
      const notation = (args.notation as string).toLowerCase();
      const match = notation.match(/^(\d+)d(\d+)$/);
      
      if (!match) {
        return { error: 'Invalid dice notation. Use format like "2d6" or "1d20"' };
      }
      
      const numDice = parseInt(match[1], 10);
      const numSides = parseInt(match[2], 10);
      
      if (numDice > 20 || numSides > 100) {
        return { error: 'Too many dice or sides' };
      }
      
      const rolls: number[] = [];
      for (let i = 0; i < numDice; i++) {
        rolls.push(Math.floor(Math.random() * numSides) + 1);
      }
      
      return {
        notation,
        rolls,
        total: rolls.reduce((a, b) => a + b, 0),
      };
    },
  },
];

// ============ Main ============

async function main(): Promise<void> {
  console.log('Initializing Native LLM pipeline with tools (client handles STT/TTS)...');
  console.log(`  Cache: ${getCacheDir()}`);
  console.log(`  Llama: ${CONFIG.llm.binaryPath}`);
  console.log(`  STT:   Client handles (WebSpeech)`);
  console.log(`  TTS:   Client handles (WebSpeech)`);
  console.log(`  Tools: ${tools.map(t => t.name).join(', ')} (prompt-based)`);

  // LLM-only pipeline with tools - client handles STT and TTS
  const pipeline = new VoicePipeline({
    stt: null,  // Client does WebSpeech STT
    llm: new NativeLlama(CONFIG.llm),
    tts: null,  // Client does WebSpeech TTS
    systemPrompt: CONFIG.systemPrompt,
    tools,
  });

  await pipeline.initialize();
  console.log('Native LLM pipeline with tools ready.');

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
          // Log tool calls for visibility
          if (response.type === 'tool_call') {
            console.log(`  🔧 Tool call: ${response.name}(${JSON.stringify(response.arguments)})`);
          } else if (response.type === 'tool_result') {
            console.log(`  ✓ Tool result: ${JSON.stringify(response.result)}`);
          }
          
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
  console.log('Try asking:');
  console.log('  - "What time is it?"');
  console.log('  - "What\'s the weather in Tokyo?"');
  console.log('  - "Roll 2d6 for me"');
  console.log('');
  console.log('Note: Native LLM uses prompt-based tool calling.');
}

main().catch(console.error);

