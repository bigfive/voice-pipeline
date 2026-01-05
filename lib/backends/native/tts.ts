/**
 * Piper TTS Pipeline (Native - piper)
 * Server-only - requires native binary
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import type { TTSPipeline, NativeTTSConfig, ProgressCallback, AudioResult } from '../../types';

export class NativePiperPipeline implements TTSPipeline {
  private config: NativeTTSConfig;
  private ready = false;

  constructor(config: NativeTTSConfig) {
    this.config = config;
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing native TTS (piper)...');

    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`piper binary not found at: ${this.config.binaryPath}`);
    }
    if (!existsSync(this.config.modelPath)) {
      throw new Error(`TTS model not found at: ${this.config.modelPath}`);
    }

    this.ready = true;
    console.log('Native TTS ready.');
  }

  async synthesize(text: string): Promise<AudioResult> {
    if (!this.ready) {
      throw new Error('TTS pipeline not initialized');
    }

    const escapedText = text.replace(/'/g, "'\\''");

    const result = execSync(
      `echo '${escapedText}' | "${this.config.binaryPath}" ` +
      `-m "${this.config.modelPath}" ` +
      `--output-raw`,
      { encoding: 'buffer', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }
    );

    // Convert Int16 PCM to Float32
    const int16 = new Int16Array(result.buffer, result.byteOffset, result.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    return {
      audio: float32,
      sampleRate: 22050, // Piper default
    };
  }

  isReady(): boolean {
    return this.ready;
  }
}

