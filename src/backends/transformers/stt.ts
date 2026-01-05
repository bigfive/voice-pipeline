/**
 * Whisper STT Pipeline (Transformers.js)
 * Isomorphic - works in browser (WebGPU) and Node.js
 */

import { pipeline } from '@huggingface/transformers';
import type { STTPipeline, TransformersSTTConfig, ProgressCallback } from '../../types';

export class WhisperSTT implements STTPipeline {
  private config: TransformersSTTConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: TransformersSTTConfig) {
    this.config = config;
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    console.log(`Loading STT model (${this.config.model})...`);

    this.pipe = await pipeline('automatic-speech-recognition', this.config.model, {
      dtype: this.config.dtype as 'fp32' | 'fp16' | 'q8' | 'q4',
      device: this.config.device,
      progress_callback: onProgress,
    });

    this.ready = true;
    console.log('STT model loaded.');
  }

  async transcribe(audio: Float32Array): Promise<string> {
    if (!this.pipe) {
      throw new Error('STT pipeline not initialized');
    }

    const options = this.config.language
      ? { language: this.config.language, task: 'transcribe' as const }
      : {};

    const result = await this.pipe(audio, options);

    if (Array.isArray(result)) {
      return result[0]?.text?.trim() || '';
    }
    return (result as { text: string }).text?.trim() || '';
  }

  isReady(): boolean {
    return this.ready;
  }
}

