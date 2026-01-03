/**
 * Voice Assistant Server
 * WebSocket server for STT (Whisper) -> LLM (Ollama) -> TTS (Piper)
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { SpeechToText } from "./stt.ts";
import { TextToSpeech } from "./tts.ts";
import { OllamaClient } from "./llm.ts";

const PORT = 8000;

const CONFIG = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "gemma3n:e2b",
    systemPrompt:
      "You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. " +
      "Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked. " +
      "The user sometimes makes typos or autocorrects the wrong thing. Make assumptions about what they may have meant and respond as if they said that.",
  },
};

// Initialize services
console.log("Initializing voice assistant server...");

const stt = new SpeechToText();
const tts = new TextToSpeech();

// Create HTTP server for WebSocket
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  const llm = new OllamaClient(CONFIG.ollama);
  let audioBuffer: Buffer[] = [];
  let sampleRate = 16000;

  ws.on("message", async (data: Buffer | string) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "audio": {
          // Accumulate audio chunks
          const chunk = Buffer.from(message.data, "base64");
          audioBuffer.push(chunk);
          sampleRate = message.sample_rate || 16000;
          break;
        }

        case "end_audio": {
          if (audioBuffer.length === 0) {
            sendJson(ws, { type: "error", message: "No audio received" });
            break;
          }

          // Combine audio buffers
          const fullAudio = Buffer.concat(audioBuffer);
          audioBuffer = [];

          // 1. Transcribe
          console.log("Transcribing...");
          const transcript = stt.transcribe(fullAudio, sampleRate);
          console.log(`Transcript: "${transcript}"`);

          sendJson(ws, { type: "transcript", text: transcript });

          if (!transcript) {
            sendJson(ws, { type: "error", message: "Could not transcribe audio" });
            break;
          }

          // 2. Stream LLM response and TTS
          console.log("Generating response...");
          let sentenceBuffer = "";
          const sentenceEnders = /[.!?]/;

          for await (const chunk of llm.chatStream(transcript)) {
            sentenceBuffer += chunk;

            // Send text chunk to client
            sendJson(ws, { type: "response_text", text: chunk, done: false });

            // Check for sentence boundaries
            const match = sentenceBuffer.match(sentenceEnders);
            if (match && match.index !== undefined) {
              const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
              sentenceBuffer = sentenceBuffer.slice(match.index + 1);

              if (sentence) {
                // Synthesize and send audio
                console.log(`Speaking: "${sentence}"`);
                const audio = tts.synthesize(sentence);
                sendJson(ws, {
                  type: "audio",
                  data: audio.samples.toString("base64"),
                  sample_rate: audio.sampleRate,
                });
              }
            }
          }

          // Speak remaining text
          if (sentenceBuffer.trim()) {
            console.log(`Speaking final: "${sentenceBuffer.trim()}"`);
            const audio = tts.synthesize(sentenceBuffer.trim());
            sendJson(ws, {
              type: "audio",
              data: audio.samples.toString("base64"),
              sample_rate: audio.sampleRate,
            });
          }

          sendJson(ws, { type: "response_text", text: "", done: true });
          sendJson(ws, { type: "done" });
          break;
        }

        case "clear_history": {
          llm.clearHistory();
          sendJson(ws, { type: "history_cleared" });
          break;
        }
      }
    } catch (err) {
      console.error("Error processing message:", err);
      sendJson(ws, { type: "error", message: String(err) });
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

function sendJson(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`Voice assistant server running on ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

