/**
 * Voice Pipeline Library - Type Definitions
 */

// ============ Message Types ============

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

// ============ Audio Types ============

export interface AudioResult {
  audio: Float32Array;
  sampleRate: number;
}

/**
 * AudioPlayable - Uniform interface for TTS output
 * Allows backends to either provide raw audio data OR direct playback
 */
export interface AudioPlayable {
  /** Get raw audio data (null if backend doesn't support raw audio, e.g., Web Speech) */
  getRawAudio(): AudioResult | null;

  /** Play the audio - works uniformly across all backends */
  play(): Promise<void>;

  /** Stop playback */
  stop(): void;
}

/**
 * BufferedAudioPlayable - For backends that produce raw audio data
 * Used by: Native TTS, Transformers TTS
 */
export class BufferedAudioPlayable implements AudioPlayable {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  constructor(
    private audio: Float32Array,
    private sampleRate: number
  ) {}

  getRawAudio(): AudioResult {
    return { audio: this.audio, sampleRate: this.sampleRate };
  }

  async play(): Promise<void> {
    if (this.audio.length === 0) return;

    // Create AudioContext on demand (handles browser autoplay policies)
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }

    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const audioBuffer = this.audioContext.createBuffer(1, this.audio.length, this.sampleRate);
    // Copy data to channel (create a standard Float32Array to satisfy TS)
    const channelData = audioBuffer.getChannelData(0);
    channelData.set(this.audio);

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.connect(this.audioContext.destination);

    return new Promise((resolve) => {
      this.sourceNode!.onended = () => resolve();
      this.sourceNode!.start();
    });
  }

  stop(): void {
    this.sourceNode?.stop();
    this.sourceNode = null;
  }
}

// ============ Progress Types ============

export interface ProgressInfo {
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

// ============ Pipeline Interfaces ============

export interface STTPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  transcribe(audio: Float32Array): Promise<string>;
  isReady(): boolean;
}

export interface LLMPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  generate(messages: Message[], onToken: (token: string) => void): Promise<string>;
  isReady(): boolean;
}

export interface TTSPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  synthesize(text: string): Promise<AudioPlayable>;
  isReady(): boolean;
}

// ============ Backend Config Types ============

export interface TransformersSTTConfig {
  model: string;
  dtype: string;
  language?: string;
  device?: 'webgpu' | 'cpu';
}

export interface TransformersLLMConfig {
  model: string;
  dtype: string;
  maxNewTokens: number;
  temperature: number;
  device?: 'webgpu' | 'cpu';
}

export interface TransformersTTSConfig {
  model: string;
  dtype: string;
  speakerEmbeddings: string;
  device?: 'webgpu' | 'cpu';
}

export interface NativeSTTConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
}

export interface NativeLLMConfig {
  binaryPath: string;
  modelPath: string;
  maxNewTokens: number;
  temperature: number;
  gpuLayers?: number;
}

export interface NativeTTSConfig {
  binaryPath: string;
  modelPath: string;
}

export interface SherpaOnnxTTSConfig {
  binaryPath: string;
  modelDir: string;  // Directory containing .onnx, tokens.txt, espeak-ng-data/
  speakerId?: number;
  speedScale?: number;
}

