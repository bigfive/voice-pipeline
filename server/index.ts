/**
 * Voice Assistant Server
 * WebSocket server using LocalAI for STT + LLM + TTS
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const PORT = 8000;

const CONFIG = {
  localai: {
    baseUrl: process.env.LOCALAI_URL || "http://localhost:8080",
    sttModel: "whisper-1",
    llmModel: "gpt-4",
    ttsModel: "tts-1",
    ttsVoice: "alloy",
    systemPrompt:
      "You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. " +
      "Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked. " +
      "The user sometimes makes typos or autocorrects the wrong thing. Make assumptions about what they may have meant and respond as if they said that.",
  },
};

// Conversation history per connection
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// ============ LocalAI API Calls ============

async function transcribe(audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", CONFIG.localai.sttModel);

  const response = await fetch(
    `${CONFIG.localai.baseUrl}/v1/audio/transcriptions`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`STT failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.text?.trim() || "";
}

async function* chatStream(
  messages: Message[]
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(`${CONFIG.localai.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.localai.llmModel,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice(6); // Remove "data: " prefix
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

async function synthesize(text: string): Promise<Buffer> {
  const response = await fetch(`${CONFIG.localai.baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.localai.ttsModel,
      input: text,
      voice: CONFIG.localai.ttsVoice,
      response_format: "pcm", // Raw PCM audio
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status} ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============ WebSocket Server ============

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

console.log("Initializing voice assistant server...");

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  let history: Message[] = [
    { role: "system", content: CONFIG.localai.systemPrompt },
  ];
  let audioBuffer: Buffer[] = [];

  ws.on("message", async (data: Buffer | string) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "audio": {
          const chunk = Buffer.from(message.data, "base64");
          audioBuffer.push(chunk);
          break;
        }

        case "end_audio": {
          if (audioBuffer.length === 0) {
            sendJson(ws, { type: "error", message: "No audio received" });
            break;
          }

          const fullAudio = Buffer.concat(audioBuffer);
          audioBuffer = [];

          // 1. Transcribe (STT)
          console.log("Transcribing...");
          const transcript = await transcribe(fullAudio);
          console.log(`Transcript: "${transcript}"`);

          sendJson(ws, { type: "transcript", text: transcript });

          if (!transcript) {
            sendJson(ws, { type: "error", message: "Could not transcribe audio" });
            break;
          }

          // Add user message to history
          history.push({ role: "user", content: transcript });

          // 2. Stream LLM response
          console.log("Generating response...");
          let fullResponse = "";
          let sentenceBuffer = "";
          const sentenceEnders = /[.!?]/;

          for await (const chunk of chatStream(history)) {
            fullResponse += chunk;
            sentenceBuffer += chunk;

            sendJson(ws, { type: "response_text", text: chunk, done: false });

            // Check for sentence boundaries for TTS
            const match = sentenceBuffer.match(sentenceEnders);
            if (match && match.index !== undefined) {
              const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
              sentenceBuffer = sentenceBuffer.slice(match.index + 1);

              if (sentence) {
                // 3. Synthesize and send audio (TTS)
                console.log(`Speaking: "${sentence}"`);
                try {
                  const audio = await synthesize(sentence);
                  sendJson(ws, {
                    type: "audio",
                    data: audio.toString("base64"),
                    sample_rate: 24000, // LocalAI default
                  });
                } catch (err) {
                  console.error("TTS error:", err);
                }
              }
            }
          }

          // Speak remaining text
          if (sentenceBuffer.trim()) {
            console.log(`Speaking final: "${sentenceBuffer.trim()}"`);
            try {
              const audio = await synthesize(sentenceBuffer.trim());
              sendJson(ws, {
                type: "audio",
                data: audio.toString("base64"),
                sample_rate: 24000,
              });
            } catch (err) {
              console.error("TTS error:", err);
            }
          }

          // Add assistant message to history
          history.push({ role: "assistant", content: fullResponse });

          sendJson(ws, { type: "response_text", text: "", done: true });
          sendJson(ws, { type: "done" });
          break;
        }

        case "clear_history": {
          history = [{ role: "system", content: CONFIG.localai.systemPrompt }];
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

server.listen(PORT, () => {
  console.log(`Voice assistant server running on ws://localhost:${PORT}`);
  console.log(`Using LocalAI at ${CONFIG.localai.baseUrl}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
