/**
 * Voice Assistant Client
 * Streams audio to server via WebSocket, receives audio back
 */

export interface VoiceClientCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onListening?: () => void;
  onProcessing?: () => void;
  onTranscript?: (text: string) => void;
  onResponseChunk?: (chunk: string) => void;
  onResponse?: (text: string) => void;
  onSpeaking?: () => void;
  onIdle?: () => void;
  onError?: (error: Error) => void;
}

export const CONFIG = {
  serverUrl: "ws://localhost:8000/ws",
  sampleRate: 16000,
};

export class VoiceClient {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private callbacks: VoiceClientCallbacks;
  private _isRecording = false;
  private _isConnected = false;
  private audioQueue: ArrayBuffer[] = [];
  private isPlayingAudio = false;
  private serverSampleRate = 22050;
  private fullResponse = "";

  constructor(callbacks: VoiceClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(CONFIG.serverUrl);

      this.ws.onopen = () => {
        console.log("Connected to server");
        this._isConnected = true;
        this.callbacks.onConnected?.();
        resolve();
      };

      this.ws.onclose = () => {
        console.log("Disconnected from server");
        this._isConnected = false;
        this.callbacks.onDisconnected?.();
      };

      this.ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        const error = new Error("WebSocket connection failed");
        this.callbacks.onError?.(error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    });
  }

  private async handleMessage(data: {
    type: string;
    text?: string;
    data?: string;
    sample_rate?: number;
    done?: boolean;
    message?: string;
  }): Promise<void> {
    switch (data.type) {
      case "transcript":
        console.log("Transcript:", data.text);
        this.callbacks.onTranscript?.(data.text || "");
        break;

      case "response_text":
        if (data.text) {
          this.fullResponse += data.text;
          this.callbacks.onResponseChunk?.(data.text);
        }
        if (data.done) {
          this.callbacks.onResponse?.(this.fullResponse);
          this.fullResponse = "";
        }
        break;

      case "audio":
        if (data.data) {
          this.serverSampleRate = data.sample_rate || 22050;
          const audioData = this.base64ToArrayBuffer(data.data);
          this.audioQueue.push(audioData);
          this.callbacks.onSpeaking?.();
          this.playNextAudio();
        }
        break;

      case "done":
        console.log("Response complete");
        // Wait for audio to finish playing before going idle
        this.waitForAudioComplete();
        break;

      case "error":
        console.error("Server error:", data.message);
        this.callbacks.onError?.(new Error(data.message || "Unknown error"));
        this.callbacks.onIdle?.();
        break;

      case "history_cleared":
        console.log("Conversation history cleared");
        break;
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async playNextAudio(): Promise<void> {
    if (this.isPlayingAudio || this.audioQueue.length === 0) return;

    this.isPlayingAudio = true;

    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift()!;
      await this.playAudioChunk(audioData);
    }

    this.isPlayingAudio = false;
  }

  private async playAudioChunk(rawPcm: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Convert raw PCM (16-bit signed int) to Float32
    const int16Array = new Int16Array(rawPcm);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    // Create audio buffer at server's sample rate
    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32Array.length,
      this.serverSampleRate
    );
    audioBuffer.getChannelData(0).set(float32Array);

    // Play audio
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  private waitForAudioComplete(): void {
    const checkAudio = () => {
      if (this.audioQueue.length === 0 && !this.isPlayingAudio) {
        this.callbacks.onIdle?.();
      } else {
        setTimeout(checkAudio, 100);
      }
    };
    checkAudio();
  }

  async startListening(): Promise<void> {
    if (!this._isConnected) {
      throw new Error("Not connected to server");
    }
    if (this._isRecording) return;

    this._isRecording = true;
    this.callbacks.onListening?.();

    // Get microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: CONFIG.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Create AudioContext for processing
    const audioContext = new AudioContext({ sampleRate: CONFIG.sampleRate });
    const source = audioContext.createMediaStreamSource(this.stream);

    // Create ScriptProcessor to capture raw PCM
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!this._isRecording || !this.ws) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Send audio chunk to server
      this.ws.send(
        JSON.stringify({
          type: "audio",
          data: this.arrayBufferToBase64(pcmData.buffer),
          sample_rate: CONFIG.sampleRate,
        })
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    // Store for cleanup
    (this as any)._audioContext = audioContext;
    (this as any)._processor = processor;
    (this as any)._source = source;

    console.log("Listening...");
  }

  async stopAndRespond(): Promise<void> {
    if (!this._isRecording) return;

    this._isRecording = false;
    this.callbacks.onProcessing?.();

    // Stop audio processing
    const audioContext = (this as any)._audioContext as AudioContext;
    const processor = (this as any)._processor as ScriptProcessorNode;
    const source = (this as any)._source as MediaStreamAudioSourceNode;

    if (processor && source) {
      source.disconnect();
      processor.disconnect();
    }
    if (audioContext) {
      await audioContext.close();
    }

    // Stop microphone
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    // Tell server we're done sending audio
    this.ws?.send(JSON.stringify({ type: "end_audio" }));

    console.log("Processing...");
  }

  clearHistory(): void {
    this.ws?.send(JSON.stringify({ type: "clear_history" }));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  isRecording(): boolean {
    return this._isRecording;
  }

  isConnected(): boolean {
    return this._isConnected;
  }
}

