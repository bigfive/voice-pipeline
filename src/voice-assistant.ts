// voice-assistant.ts
// Full browser-based voice assistant: Moonshine STT + Ollama LLM + Kitten TTS

import {
  AutoTokenizer,
  AutoProcessor,
  MoonshineForConditionalGeneration,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web";
import { phonemize } from "phonemizer";

// ============ CONFIG ============
export const CONFIG = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "gemma3n:e2b",
    systemPrompt: "You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked.",
  },
  stt: {
    modelId: "onnx-community/moonshine-tiny-ONNX",
    device: "webgpu" as const,
  },
  tts: {
    // Kitten TTS Nano - only ~24MB, 15M parameters
    // Served from the demo's GitHub Pages
    modelUrl: "https://clowerweb.github.io/kitten-tts-web-demo/tts-model/model_quantized.onnx",
    tokenizerUrl: "https://clowerweb.github.io/kitten-tts-web-demo/tts-model/tokenizer.json",
    voicesUrl: "https://clowerweb.github.io/kitten-tts-web-demo/tts-model/voices.json",
    voice: "expr-voice-4-m", // Available: expr-voice-1-m, expr-voice-1-f, expr-voice-2-m, expr-voice-2-f, etc.
    speed: 1.0,
    device: "webgpu" as const, // "webgpu" or "wasm"
  },
};

// ============ STT (Moonshine) ============
class SpeechToText {
  private tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
  private processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
  private model: Awaited<ReturnType<typeof MoonshineForConditionalGeneration.from_pretrained>> | null = null;
  private ready = false;

  async init(onProgress?: (progress: number) => void) {
    console.log("Loading Moonshine STT...");

    const progressCallback = (p: { progress?: number }) => {
      if (p.progress !== undefined && onProgress) {
        onProgress(p.progress);
      }
    };

    [this.tokenizer, this.processor, this.model] = await Promise.all([
      AutoTokenizer.from_pretrained(CONFIG.stt.modelId, { progress_callback: progressCallback }),
      AutoProcessor.from_pretrained(CONFIG.stt.modelId, { progress_callback: progressCallback }),
      MoonshineForConditionalGeneration.from_pretrained(CONFIG.stt.modelId, {
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        device: CONFIG.stt.device,
        progress_callback: progressCallback,
      }),
    ]);

    this.ready = true;
    console.log("Moonshine STT ready");
  }

  async transcribe(audioData: Float32Array, sampleRate: number): Promise<string> {
    if (!this.ready || !this.processor || !this.model || !this.tokenizer) {
      throw new Error("STT not initialized");
    }

    // Resample to 16kHz if needed
    const targetSampleRate = 16000;
    let processedAudio = audioData;

    if (sampleRate !== targetSampleRate) {
      processedAudio = this.resample(audioData, sampleRate, targetSampleRate);
    }

    const inputs = await this.processor(processedAudio, { sampling_rate: targetSampleRate });
    const outputs = await this.model.generate({
      ...inputs,
      max_new_tokens: 256,
    });

    const text = this.tokenizer.batch_decode(outputs, { skip_special_tokens: true });
    return (text[0] as string)?.trim() || "";
  }

  private resample(audioData: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
      const t = srcIndex - srcIndexFloor;
      result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
    }

    return result;
  }
}

// ============ TTS (Kitten TTS Nano) ============
interface TokenizerData {
  model: { vocab: Record<string, number> };
}

interface VoiceEmbeddings {
  [voice: string]: number[][];
}

class TextToSpeech {
  private session: ort.InferenceSession | null = null;
  private wasmSession: ort.InferenceSession | null = null;
  private vocab: Record<string, number> = {};
  private voiceEmbeddings: VoiceEmbeddings = {};
  private audioContext: AudioContext | null = null;
  private ready = false;
  private modelBuffer: ArrayBuffer | null = null;

  async init(onProgress?: (progress: number) => void) {
    console.log("Loading Kitten TTS...");

    // Configure ONNX Runtime
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

    onProgress?.(5);

    // Fetch model, tokenizer, and voices in parallel
    const [modelResponse, tokenizerResponse, voicesResponse] = await Promise.all([
      fetch(CONFIG.tts.modelUrl),
      fetch(CONFIG.tts.tokenizerUrl),
      fetch(CONFIG.tts.voicesUrl),
    ]);

    onProgress?.(30);

    const [modelBuffer, tokenizerData, voicesData] = await Promise.all([
      modelResponse.arrayBuffer(),
      tokenizerResponse.json() as Promise<TokenizerData>,
      voicesResponse.json() as Promise<VoiceEmbeddings>,
    ]);

    this.modelBuffer = modelBuffer;
    this.vocab = tokenizerData.model.vocab;
    this.voiceEmbeddings = voicesData;

    onProgress?.(60);

    // Create ONNX session - try WebGPU first, fallback to WASM
    try {
      if (CONFIG.tts.device === "webgpu") {
        this.session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: [
            { name: "webgpu", powerPreference: "high-performance" },
            "wasm",
          ],
        });
        console.log("Kitten TTS using WebGPU");
      } else {
        throw new Error("Using WASM as configured");
      }
    } catch {
      this.session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: [{ name: "wasm" }],
      });
      console.log("Kitten TTS using WASM");
    }

    onProgress?.(90);

    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.ready = true;
    onProgress?.(100);
    console.log("Kitten TTS ready");
  }

  private async textToPhonemes(text: string): Promise<string> {
    const phonemes = await phonemize(text, "en-us");
    if (typeof phonemes === "string") return phonemes;
    if (Array.isArray(phonemes)) return phonemes.join(" ");
    return String(phonemes || text);
  }

  private async tokenize(text: string): Promise<number[]> {
    const phonemes = await this.textToPhonemes(text);
    const tokensWithBoundaries = `$${phonemes}$`;

    return tokensWithBoundaries.split("").map((char) => {
      const tokenId = this.vocab[char];
      if (tokenId === undefined) {
        console.warn(`Unknown character: "${char}", using $ token`);
        return 0;
      }
      return tokenId;
    });
  }

  async speak(text: string): Promise<void> {
    if (!this.ready || !this.session || !this.audioContext) {
      throw new Error("TTS not initialized");
    }

    const voice = CONFIG.tts.voice;
    const speed = CONFIG.tts.speed;

    if (!this.voiceEmbeddings[voice]) {
      throw new Error(`Voice "${voice}" not found`);
    }

    // Tokenize text
    const tokenIds = await this.tokenize(text);
    const inputIds = new BigInt64Array(tokenIds.map((id) => BigInt(id)));
    const speakerEmbedding = new Float32Array(this.voiceEmbeddings[voice][0]);

    // Prepare inputs
    const inputs: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", inputIds, [1, inputIds.length]),
      style: new ort.Tensor("float32", speakerEmbedding, [1, speakerEmbedding.length]),
      speed: new ort.Tensor("float32", new Float32Array([speed]), [1]),
    };

    // Run inference
    let results = await this.session.run(inputs);
    let audioData = results.waveform.data as Float32Array;

    // Check for NaN values (WebGPU issue) and fallback to WASM
    if (audioData.length > 0 && isNaN(audioData[0])) {
      console.warn("WebGPU produced NaN, falling back to WASM");
      if (!this.wasmSession && this.modelBuffer) {
        this.wasmSession = await ort.InferenceSession.create(this.modelBuffer, {
          executionProviders: ["wasm"],
        });
      }
      if (this.wasmSession) {
        results = await this.wasmSession.run(inputs);
        audioData = results.waveform.data as Float32Array;
      }
    }

    // Apply speed adjustment if needed
    let finalAudio = audioData;
    if (speed !== 1.0) {
      const newLength = Math.floor(audioData.length / speed);
      finalAudio = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const srcIndex = Math.min(Math.floor(i * speed), audioData.length - 1);
        finalAudio[i] = audioData[srcIndex];
      }
    }

    // Clean and normalize audio
    let maxAmplitude = 0;
    for (let i = 0; i < finalAudio.length; i++) {
      if (isNaN(finalAudio[i])) finalAudio[i] = 0;
      maxAmplitude = Math.max(maxAmplitude, Math.abs(finalAudio[i]));
    }

    if (maxAmplitude > 0 && maxAmplitude < 0.1) {
      const normFactor = 0.5 / maxAmplitude;
      for (let i = 0; i < finalAudio.length; i++) {
        finalAudio[i] *= normFactor;
      }
    }

    // Play audio
    const audioBuffer = this.audioContext.createBuffer(1, finalAudio.length, 24000);
    audioBuffer.getChannelData(0).set(finalAudio);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();

    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  }

  // Streaming TTS - processes text in sentence chunks
  async speakStream(textStream: AsyncIterable<string>): Promise<void> {
    if (!this.ready) throw new Error("TTS not initialized");

    let buffer = "";
    const sentenceEnders = /[.!?]/;

    for await (const chunk of textStream) {
      buffer += chunk;

      const match = buffer.match(sentenceEnders);
      if (match && match.index !== undefined) {
        const sentence = buffer.slice(0, match.index + 1).trim();
        buffer = buffer.slice(match.index + 1);

        if (sentence) {
          await this.speak(sentence);
        }
      }
    }

    if (buffer.trim()) {
      await this.speak(buffer.trim());
    }
  }
}

// ============ LLM (Ollama) ============
class OllamaLLM {
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor() {
    this.initSystemPrompt();
  }

  private initSystemPrompt() {
    this.conversationHistory = [
      { role: "system", content: CONFIG.ollama.systemPrompt },
    ];
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${CONFIG.ollama.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(userMessage: string): Promise<string> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    const response = await fetch(`${CONFIG.ollama.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.ollama.model,
        messages: this.conversationHistory,
        stream: false,
      }),
    });

    const data = await response.json();
    const assistantMessage = data.message?.content || "";

    this.conversationHistory.push({ role: "assistant", content: assistantMessage });
    return assistantMessage;
  }

  async *chatStream(userMessage: string): AsyncGenerator<string> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    const response = await fetch(`${CONFIG.ollama.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.ollama.model,
        messages: this.conversationHistory,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullResponse += json.message.content;
            yield json.message.content;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    this.conversationHistory.push({ role: "assistant", content: fullResponse });
  }

  clearHistory() {
    this.initSystemPrompt();
  }
}

// ============ AUDIO RECORDER ============
class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    this.mediaRecorder.start();
  }

  async stop(): Promise<{ audioData: Float32Array; sampleRate: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("Not recording"));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.audioChunks, { type: "audio/webm" });
          const arrayBuffer = await blob.arrayBuffer();

          const audioContext = new AudioContext({ sampleRate: 16000 });
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const audioData = audioBuffer.getChannelData(0);

          this.stream?.getTracks().forEach((t) => t.stop());
          await audioContext.close();

          resolve({ audioData, sampleRate: 16000 });
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }
}

// ============ EVENT CALLBACKS ============
export interface VoiceAssistantCallbacks {
  onInitProgress?: (stage: string, progress: number) => void;
  onReady?: () => void;
  onListening?: () => void;
  onProcessing?: () => void;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  onResponseChunk?: (chunk: string) => void;
  onSpeaking?: () => void;
  onIdle?: () => void;
  onError?: (error: Error) => void;
}

// ============ VOICE ASSISTANT ============
export class VoiceAssistant {
  private stt = new SpeechToText();
  private tts = new TextToSpeech();
  private llm = new OllamaLLM();
  private recorder = new AudioRecorder();
  private _isRecording = false;
  private ready = false;
  private callbacks: VoiceAssistantCallbacks = {};

  constructor(callbacks?: VoiceAssistantCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  async init() {
    console.log("Initializing Voice Assistant...");

    try {
      this.callbacks.onInitProgress?.("Checking Ollama connection...", 0);
      const ollamaOk = await this.llm.checkConnection();
      if (!ollamaOk) {
        throw new Error(`Ollama not running at ${CONFIG.ollama.baseUrl}`);
      }

      this.callbacks.onInitProgress?.("Loading Moonshine STT...", 10);
      await this.stt.init((p) => {
        this.callbacks.onInitProgress?.("Loading Moonshine STT...", 10 + p * 0.4);
      });

      this.callbacks.onInitProgress?.("Loading Kitten TTS...", 50);
      await this.tts.init((p) => {
        this.callbacks.onInitProgress?.("Loading Kitten TTS...", 50 + p * 0.5);
      });

      this.ready = true;
      this.callbacks.onInitProgress?.("Ready!", 100);
      this.callbacks.onReady?.();
      console.log("Voice Assistant ready!");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async startListening() {
    if (!this.ready) throw new Error("Not initialized");
    if (this._isRecording) return;

    this._isRecording = true;
    await this.recorder.start();
    this.callbacks.onListening?.();
    console.log("Listening...");
  }

  async stopAndRespond(): Promise<string> {
    if (!this._isRecording) throw new Error("Not recording");

    this._isRecording = false;
    this.callbacks.onProcessing?.();
    console.log("Processing...");

    try {
      const { audioData, sampleRate } = await this.recorder.stop();
      const userText = await this.stt.transcribe(audioData, sampleRate);
      console.log("You said:", userText);
      this.callbacks.onTranscript?.(userText);

      if (!userText) {
        const noInputMsg = "Sorry, I didn't catch that.";
        this.callbacks.onSpeaking?.();
        await this.tts.speak(noInputMsg);
        this.callbacks.onIdle?.();
        return "";
      }

      console.log("Thinking...");
      let fullResponse = "";

      const responseCollector = async function* (
        stream: AsyncGenerator<string>,
        onChunk: (chunk: string) => void
      ): AsyncGenerator<string> {
        for await (const chunk of stream) {
          fullResponse += chunk;
          onChunk(chunk);
          yield chunk;
        }
      };

      const responseStream = responseCollector(
        this.llm.chatStream(userText),
        (chunk) => this.callbacks.onResponseChunk?.(chunk)
      );

      this.callbacks.onSpeaking?.();
      await this.tts.speakStream(responseStream);

      this.callbacks.onResponse?.(fullResponse);
      this.callbacks.onIdle?.();

      return userText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      this.callbacks.onIdle?.();
      throw error;
    }
  }

  async stopAndRespondSimple(): Promise<string> {
    if (!this._isRecording) throw new Error("Not recording");

    this._isRecording = false;
    this.callbacks.onProcessing?.();

    try {
      const { audioData, sampleRate } = await this.recorder.stop();
      const userText = await this.stt.transcribe(audioData, sampleRate);
      console.log("You said:", userText);
      this.callbacks.onTranscript?.(userText);

      if (!userText) {
        this.callbacks.onSpeaking?.();
        await this.tts.speak("Sorry, I didn't catch that.");
        this.callbacks.onIdle?.();
        return "";
      }

      const response = await this.llm.chat(userText);
      console.log("Assistant:", response);
      this.callbacks.onResponse?.(response);

      this.callbacks.onSpeaking?.();
      await this.tts.speak(response);
      this.callbacks.onIdle?.();

      return userText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      this.callbacks.onIdle?.();
      throw error;
    }
  }

  isRecording(): boolean {
    return this._isRecording;
  }

  isReady(): boolean {
    return this.ready;
  }

  clearHistory() {
    this.llm.clearHistory();
  }
}
