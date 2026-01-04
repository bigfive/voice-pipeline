/**
 * Text-to-Speech Pipeline
 * Uses SpeechT5 via Transformers.js for speech synthesis
 */

import { pipeline } from '@huggingface/transformers';
import type { TTSConfig } from '../config';
import type { TTSPipeline } from './types';
import type { AudioResult } from '../../shared/types';

export class SpeechT5Pipeline implements TTSPipeline {
  private config: TTSConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`Loading TTS model (${this.config.model})...`);

    this.pipe = await pipeline('text-to-speech', this.config.model);

    this.ready = true;
    console.log('TTS model loaded.');
  }

  async synthesize(text: string): Promise<AudioResult> {
    if (!this.pipe) {
      throw new Error('TTS pipeline not initialized');
    }

    const result = await this.pipe(text, {
      speaker_embeddings: this.config.speakerEmbeddings,
    });

    return {
      audio: result.audio,
      sampleRate: result.sampling_rate,
    };
  }

  isReady(): boolean {
    return this.ready;
  }
}

