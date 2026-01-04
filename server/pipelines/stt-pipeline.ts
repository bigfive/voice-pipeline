/**
 * Speech-to-Text Pipeline
 * Uses Whisper via Transformers.js for transcription
 */

import { pipeline } from '@huggingface/transformers';
import type { STTConfig } from '../config';
import type { STTPipeline } from './types';

export class WhisperSTTPipeline implements STTPipeline {
  private config: STTConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: STTConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`Loading STT model (${this.config.model})...`);

    this.pipe = await pipeline('automatic-speech-recognition', this.config.model, {
      dtype: this.config.dtype as 'fp32' | 'fp16' | 'q8' | 'q4',
    });

    this.ready = true;
    console.log('STT model loaded.');
  }

  async transcribe(audio: Float32Array): Promise<string> {
    if (!this.pipe) {
      throw new Error('STT pipeline not initialized');
    }

    const result = await this.pipe(audio, {
      language: this.config.language,
      task: 'transcribe',
    });

    if (Array.isArray(result)) {
      return result[0]?.text?.trim() || '';
    }
    return (result as { text: string }).text?.trim() || '';
  }

  isReady(): boolean {
    return this.ready;
  }
}

/** Utility: Convert Int16 PCM buffer to Float32Array */
export function pcmBufferToFloat32(buffer: Buffer): Float32Array {
  const int16 = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 2
  );

  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  return float32;
}

