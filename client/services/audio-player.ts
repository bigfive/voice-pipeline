/**
 * Audio Player Service
 * Queued playback of audio chunks with ordered delivery
 */

export interface AudioChunk {
  audio: Float32Array;
  sampleRate: number;
}

export type AudioCompleteCallback = () => void;

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioChunk[] = [];
  private isPlaying = false;
  private onComplete: AudioCompleteCallback | null = null;

  /** Queue an audio chunk for playback */
  enqueue(audio: Float32Array, sampleRate: number): void {
    this.audioQueue.push({ audio, sampleRate });
    this.playNext();
  }

  /** Set callback for when all audio has finished playing */
  setOnComplete(callback: AudioCompleteCallback | null): void {
    this.onComplete = callback;
  }

  /** Check if audio is currently playing or queued */
  isBusy(): boolean {
    return this.isPlaying || this.audioQueue.length > 0;
  }

  /** Clear the queue and stop playback */
  clear(): void {
    this.audioQueue = [];
    // Note: Can't immediately stop currently playing audio
    // but we prevent further playback from the queue
  }

  /** Wait for all queued audio to complete */
  waitForComplete(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.audioQueue.length === 0 && !this.isPlaying) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /** Play the next chunk in the queue */
  private async playNext(): Promise<void> {
    if (this.isPlaying || this.audioQueue.length === 0) return;

    this.isPlaying = true;

    while (this.audioQueue.length > 0) {
      const chunk = this.audioQueue.shift()!;
      await this.playChunk(chunk);
    }

    this.isPlaying = false;

    // Notify completion
    if (this.onComplete) {
      this.onComplete();
    }
  }

  /** Play a single audio chunk */
  private async playChunk(chunk: AudioChunk): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Create audio buffer at the chunk's sample rate
    const audioBuffer = this.audioContext.createBuffer(
      1,
      chunk.audio.length,
      chunk.sampleRate
    );
    audioBuffer.getChannelData(0).set(chunk.audio);

    // Play audio
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  /** Clean up resources */
  dispose(): void {
    this.audioQueue = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

