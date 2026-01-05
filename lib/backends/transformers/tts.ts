/**
 * SpeechT5 TTS Pipeline (Transformers.js)
 * Isomorphic - works in browser (WebGPU) and Node.js
 */

import { pipeline } from '@huggingface/transformers';
import type { TTSPipeline, TransformersTTSConfig, ProgressCallback, AudioResult } from '../../types';

export class SpeechT5Pipeline implements TTSPipeline {
  private config: TransformersTTSConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: TransformersTTSConfig) {
    this.config = config;
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    console.log(`Loading TTS model (${this.config.model})...`);

    this.pipe = await pipeline('text-to-speech', this.config.model, {
      dtype: this.config.dtype as 'fp32' | 'fp16' | 'q8' | 'q4',
      device: this.config.device,
      progress_callback: onProgress,
    });

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

