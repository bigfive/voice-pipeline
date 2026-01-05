/**
 * Audio Player
 *
 * Manages a queue of audio chunks and plays them in order.
 */

export interface AudioPlayerConfig {
  /** Callback when playback starts */
  onStart?: () => void;
  /** Callback when all queued audio finishes */
  onEnd?: () => void;
}

interface QueuedAudio {
  audio: Float32Array;
  sampleRate: number;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private queue: QueuedAudio[] = [];
  private isPlaying = false;
  private onStartCallback?: () => void;
  private onEndCallback?: () => void;

  constructor(config: AudioPlayerConfig = {}) {
    this.onStartCallback = config.onStart;
    this.onEndCallback = config.onEnd;
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Number of items in the queue
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Enqueue audio for playback
   */
  enqueue(audio: Float32Array, sampleRate: number): void {
    this.queue.push({ audio, sampleRate });
    this.playNext();
  }

  /**
   * Clear the queue and stop playback
   */
  clear(): void {
    this.queue = [];
    // Note: current playback will finish, but nothing else will play
  }

  /**
   * Stop playback and clear queue
   */
  stop(): void {
    this.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isPlaying = false;
  }

  private async playNext(): Promise<void> {
    if (this.isPlaying || this.queue.length === 0) return;

    this.isPlaying = true;
    this.onStartCallback?.();

    const { audio, sampleRate } = this.queue.shift()!;

    // Create or reuse audio context
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }

    // Create buffer and source
    const buffer = this.audioContext.createBuffer(1, audio.length, sampleRate);
    buffer.getChannelData(0).set(audio);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Handle completion
    source.onended = () => {
      this.isPlaying = false;
      if (this.queue.length > 0) {
        this.playNext();
      } else {
        this.onEndCallback?.();
      }
    };

    source.start();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.onStartCallback = undefined;
    this.onEndCallback = undefined;
  }
}

