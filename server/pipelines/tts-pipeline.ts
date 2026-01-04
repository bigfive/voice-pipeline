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
  private cache = new Map<string, AudioResult>();

  constructor(config: TTSConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`Loading TTS model (${this.config.model})...`);

    this.pipe = await pipeline('text-to-speech', this.config.model, {
      dtype: this.config.dtype,
    });

    this.ready = true;
    console.log('TTS model loaded.');
  }

  async synthesize(text: string): Promise<AudioResult> {
    if (!this.pipe) {
      throw new Error('TTS pipeline not initialized');
    }

    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      console.log(`TTS cache hit: "${text}"`);
      return cached;
    }

    const result = await this.pipe(text, {
      speaker_embeddings: this.config.speakerEmbeddings,
    });

    return {
      audio: result.audio,
      sampleRate: result.sampling_rate,
    };
  }

  async precache(phrases: string[]): Promise<void> {
    if (!this.pipe) {
      throw new Error('TTS pipeline not initialized');
    }

    console.log(`Pre-caching ${phrases.length} TTS phrase(s)...`);

    for (const phrase of phrases) {
      if (this.cache.has(phrase)) {
        continue;
      }

      const result = await this.pipe(phrase, {
        speaker_embeddings: this.config.speakerEmbeddings,
      });

      this.cache.set(phrase, {
        audio: result.audio,
        sampleRate: result.sampling_rate,
      });

      console.log(`  Cached: "${phrase}"`);
    }

    console.log('TTS pre-caching complete.');
  }

  getCached(text: string): AudioResult | null {
    return this.cache.get(text) ?? null;
  }

  isReady(): boolean {
    return this.ready;
  }
}

