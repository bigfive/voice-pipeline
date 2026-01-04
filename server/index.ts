/**
 * Voice Assistant Server
 * 100% local using Transformers.js for STT, TTS, and LLM
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { pipeline } from "@huggingface/transformers";
import numberToWords from "number-to-words";
const { toWords, toWordsOrdinal } = numberToWords;

const PORT = 8000;

const CONFIG = {
  stt: {
    model: "Xenova/whisper-small",
  },
  llm: {
    model: "HuggingFaceTB/SmolLM2-360M-Instruct",
    systemPrompt:
      "You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. " +
      "Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked.",
    maxNewTokens: 200,
  },
  tts: {
    model: "Xenova/speecht5_tts",
    speakerEmbeddings: "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
  },
};

// Conversation history per connection
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

// ============ Transformers.js Pipelines ============

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sttPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llmPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPipeline: any = null;

async function initPipelines(): Promise<void> {
  console.log(`Loading STT model (${CONFIG.stt.model})...`);
  sttPipeline = await pipeline("automatic-speech-recognition", CONFIG.stt.model, { dtype: "q8" });
  console.log("STT model loaded.");

  console.log(`Loading LLM model (${CONFIG.llm.model})...`);
  llmPipeline = await pipeline("text-generation", CONFIG.llm.model, { dtype: "q4" });
  console.log("LLM model loaded.");

  console.log(`Loading TTS model (${CONFIG.tts.model})...`);
  ttsPipeline = await pipeline("text-to-speech", CONFIG.tts.model);
  console.log("TTS model loaded.");
}

async function transcribe(audioBuffer: Buffer): Promise<string> {
  if (!sttPipeline) throw new Error("STT pipeline not initialized");

  // Convert Buffer to Float32Array (assuming 16-bit PCM at 16kHz)
  const int16 = new Int16Array(
    audioBuffer.buffer,
    audioBuffer.byteOffset,
    audioBuffer.byteLength / 2
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  const result = await sttPipeline(float32, {
    language: "en",
    task: "transcribe",
  });

  if (Array.isArray(result)) {
    return result[0]?.text?.trim() || "";
  }
  return (result as { text: string }).text?.trim() || "";
}

function formatChatPrompt(messages: Message[]): string {
  // Format messages for Qwen chat template
  let prompt = "";
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
    } else if (msg.role === "user") {
      prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
    } else if (msg.role === "assistant") {
      prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
    }
  }
  prompt += "<|im_start|>assistant\n";
  return prompt;
}

async function generateResponse(
  messages: Message[],
  onToken: (token: string) => void
): Promise<string> {
  if (!llmPipeline) throw new Error("LLM pipeline not initialized");

  const prompt = formatChatPrompt(messages);

  // Generate response (non-streaming for simplicity)
  const result = await llmPipeline(prompt, {
    max_new_tokens: CONFIG.llm.maxNewTokens,
    do_sample: true,
    temperature: 0.7,
    return_full_text: false,
  });

  const response = result[0]?.generated_text?.trim() || "";

  // Send response token by token for UI streaming effect
  for (const char of response) {
    onToken(char);
  }

  return response;
}

// ============ Text Normalization for TTS ============

function normalizeTextForTTS(text: string): string {
  // Handle decimal numbers (e.g., "3.14" -> "three point one four")
  text = text.replace(/(\d+)\.(\d+)/g, (_, whole, decimal) => {
    const wholeWords = toWords(parseInt(whole, 10));
    const decimalDigits = decimal.split("").map((d: string) => toWords(parseInt(d, 10))).join(" ");
    return `${wholeWords} point ${decimalDigits}`;
  });

  // Handle ordinals (1st, 2nd, 3rd, etc.)
  text = text.replace(/(\d+)(st|nd|rd|th)\b/gi, (_, num) => {
    return toWordsOrdinal(parseInt(num, 10));
  });

  // Handle currency ($19.99 -> "nineteen dollars and ninety nine cents")
  text = text.replace(/\$(\d+)\.(\d{2})\b/g, (_, dollars, cents) => {
    const d = parseInt(dollars, 10);
    const c = parseInt(cents, 10);
    let result = toWords(d) + (d === 1 ? " dollar" : " dollars");
    if (c > 0) {
      result += " and " + toWords(c) + (c === 1 ? " cent" : " cents");
    }
    return result;
  });
  text = text.replace(/\$(\d+)\b/g, (_, dollars) => {
    const d = parseInt(dollars, 10);
    return toWords(d) + (d === 1 ? " dollar" : " dollars");
  });

  // Handle percentages (50% -> "fifty percent")
  text = text.replace(/(\d+)%/g, (_, num) => {
    return toWords(parseInt(num, 10)) + " percent";
  });

  // Handle years (likely 4-digit numbers between 1000-2999)
  text = text.replace(/\b(1\d{3}|2\d{3})\b/g, (match) => {
    const year = parseInt(match, 10);
    // Read as pairs for years (e.g., 2024 -> "twenty twenty four")
    if (year >= 2000 && year < 2010) {
      return "two thousand " + (year === 2000 ? "" : toWords(year - 2000));
    }
    if (year >= 2010 && year < 3000) {
      const first = Math.floor(year / 100);
      const last = year % 100;
      return toWords(first) + " " + (last < 10 ? "oh " + toWords(last) : toWords(last));
    }
    if (year >= 1000 && year < 2000) {
      const first = Math.floor(year / 100);
      const last = year % 100;
      return toWords(first) + " " + (last === 0 ? "hundred" : last < 10 ? "oh " + toWords(last) : toWords(last));
    }
    return toWords(year);
  });

  // Handle remaining standalone numbers
  text = text.replace(/\b(\d+)\b/g, (match) => {
    return toWords(parseInt(match, 10));
  });

  // Common abbreviations
  const abbreviations: Record<string, string> = {
    "Dr.": "Doctor",
    "Mr.": "Mister",
    "Mrs.": "Missus",
    "Ms.": "Miss",
    "Prof.": "Professor",
    "Jr.": "Junior",
    "Sr.": "Senior",
    "vs.": "versus",
    "etc.": "etcetera",
    "e.g.": "for example",
    "i.e.": "that is",
    "approx.": "approximately",
    "govt.": "government",
    "dept.": "department",
  };
  for (const [abbr, full] of Object.entries(abbreviations)) {
    text = text.replace(new RegExp(abbr.replace(".", "\\."), "gi"), full);
  }

  // Symbols to words
  text = text.replace(/&/g, " and ");
  text = text.replace(/@/g, " at ");
  text = text.replace(/\+/g, " plus ");
  text = text.replace(/=/g, " equals ");
  text = text.replace(/#(\w+)/g, "hashtag $1"); // #word -> "hashtag word"
  text = text.replace(/#/g, " number ");        // standalone #

  // Remove or replace problematic punctuation
  text = text.replace(/\.\.\./g, ", ");         // ellipsis -> pause
  text = text.replace(/[;:]/g, ", ");           // semicolons/colons -> comma
  text = text.replace(/[()[\]{}]/g, " ");       // brackets -> space
  text = text.replace(/[""«»]/g, "");           // double quotes/guillemets -> remove
  // Single quotes: only remove when NOT part of contractions (i.e., not between word chars)
  text = text.replace(/(?<!\w)[''']|['''](?!\w)/g, ""); // remove quotes at word boundaries
  text = text.replace(/[*_~`]/g, "");           // markdown formatting -> remove

  // Remove hyphens (TTS models often pause at hyphens)
  text = text.replace(/-/g, " ");

  // Clean up extra spaces
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

async function synthesize(text: string): Promise<{ audio: Float32Array; sampleRate: number }> {
  if (!ttsPipeline) throw new Error("TTS pipeline not initialized");

  // Normalize text for TTS (convert numbers to words, etc.)
  const normalizedText = normalizeTextForTTS(text);
  console.log(`TTS normalized: "${text}" -> "${normalizedText}"`);

  const result = await ttsPipeline(normalizedText, {
    speaker_embeddings: CONFIG.tts.speakerEmbeddings,
  });

  return {
    audio: result.audio,
    sampleRate: result.sampling_rate,
  };
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

initPipelines()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Voice assistant server running on ws://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log("All models loaded from Transformers.js - fully local!");
    });
  })
  .catch((err) => {
    console.error("Failed to initialize pipelines:", err);
    process.exit(1);
  });

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  let history: Message[] = [
    { role: "system", content: CONFIG.llm.systemPrompt },
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

          // 2. Generate LLM response with streaming TTS
          console.log("Generating response...");
          let sentenceBuffer = "";
          const sentenceEnders = /[.!?]/;

          // Ordered audio queue - sends audio in order even if TTS completes out of order
          type AudioResult = { audio: Float32Array; sampleRate: number };
          const audioQueue = new Map<number, AudioResult>();
          let nextSentenceIndex = 0;
          let nextToSend = 0;
          const ttsPromises: Promise<void>[] = [];

          function flushAudioQueue() {
            // Send all consecutive ready audio chunks starting from nextToSend
            while (audioQueue.has(nextToSend)) {
              const result = audioQueue.get(nextToSend)!;
              const buffer = Buffer.from(result.audio.buffer);
              sendJson(ws, {
                type: "audio",
                data: buffer.toString("base64"),
                sample_rate: result.sampleRate,
                format: "float32",
              });
              audioQueue.delete(nextToSend);
              nextToSend++;
            }
          }

          function queueTTS(sentence: string, index: number) {
            console.log(`TTS [${index}]: "${sentence}"`);
            const promise = synthesize(sentence)
              .then((result) => {
                audioQueue.set(index, result);
                flushAudioQueue();
              })
              .catch((err) => {
                console.error(`TTS error [${index}]:`, err);
                // Skip this index on error so queue doesn't stall
                nextToSend = Math.max(nextToSend, index + 1);
                flushAudioQueue();
              });
            ttsPromises.push(promise);
          }

          const fullResponse = await generateResponse(history, (token) => {
            sentenceBuffer += token;
            sendJson(ws, { type: "response_text", text: token, done: false });

            // Check for sentence boundaries for TTS
            const match = sentenceBuffer.match(sentenceEnders);
            if (match && match.index !== undefined) {
              const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
              sentenceBuffer = sentenceBuffer.slice(match.index + 1);
              if (sentence) {
                queueTTS(sentence, nextSentenceIndex++);
              }
            }
          });

          // Handle any remaining text
          if (sentenceBuffer.trim()) {
            queueTTS(sentenceBuffer.trim(), nextSentenceIndex++);
          }

          // Wait for all TTS to complete
          await Promise.all(ttsPromises);

          // Add assistant message to history
          history.push({ role: "assistant", content: fullResponse });

          sendJson(ws, { type: "response_text", text: "", done: true });
          sendJson(ws, { type: "done" });
          break;
        }

        case "clear_history": {
          history = [{ role: "system", content: CONFIG.llm.systemPrompt }];
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
