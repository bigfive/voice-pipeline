/**
 * Sherpa-ONNX TTS Pipeline (Native)
 * Server-only - requires sherpa-onnx binary
 *
 * Uses sherpa-onnx-offline-tts which supports Piper ONNX models.
 * See: https://github.com/k2-fsa/sherpa-onnx
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TTSPipeline, SherpaOnnxTTSConfig, ProgressCallback, AudioResult, AudioPlayable } from '../../types';
import { BufferedAudioPlayable } from '../../types';

export class NativeSherpaOnnxTTS implements TTSPipeline {
  private config: SherpaOnnxTTSConfig;
  private ready = false;
  private modelPath: string = '';
  private tokensPath: string = '';
  private dataDir: string = '';

  constructor(config: SherpaOnnxTTSConfig) {
    this.config = {
      speakerId: 0,
      speedScale: 1.0,
      ...config,
    };
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing native TTS (sherpa-onnx)...');

    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`sherpa-onnx-offline-tts binary not found at: ${this.config.binaryPath}`);
    }
    if (!existsSync(this.config.modelDir)) {
      throw new Error(`TTS model directory not found at: ${this.config.modelDir}`);
    }

    // Find the model files in the directory
    const modelDir = this.config.modelDir;

    // Look for .onnx file
    const onnxFiles = ['en_US-lessac-medium.onnx', 'model.onnx']
      .map(f => join(modelDir, f))
      .filter(f => existsSync(f));

    if (onnxFiles.length === 0) {
      throw new Error(`No .onnx model file found in: ${modelDir}`);
    }
    this.modelPath = onnxFiles[0];

    // Look for tokens.txt
    this.tokensPath = join(modelDir, 'tokens.txt');
    if (!existsSync(this.tokensPath)) {
      throw new Error(`tokens.txt not found in: ${modelDir}`);
    }

    // Look for espeak-ng-data directory
    this.dataDir = join(modelDir, 'espeak-ng-data');
    if (!existsSync(this.dataDir)) {
      throw new Error(`espeak-ng-data directory not found in: ${modelDir}`);
    }

    this.ready = true;
    console.log('Native TTS (sherpa-onnx) ready.');
  }

  async synthesize(text: string): Promise<AudioPlayable> {
    if (!this.ready) {
      throw new Error('TTS pipeline not initialized');
    }

    // sherpa-onnx outputs to a file, so we use a temp file
    const tmpFile = join(tmpdir(), `sherpa-tts-${Date.now()}.wav`);

    try {
      const escapedText = text.replace(/'/g, "'\\''");

      execSync(
        `"${this.config.binaryPath}" ` +
        `--vits-model="${this.modelPath}" ` +
        `--vits-tokens="${this.tokensPath}" ` +
        `--vits-data-dir="${this.dataDir}" ` +
        `--sid=${this.config.speakerId} ` +
        `--output-filename="${tmpFile}" ` +
        `'${escapedText}'`,
        { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }
      );

      // Read the WAV file and extract PCM data
      const wavBuffer = readFileSync(tmpFile);
      const { audio, sampleRate } = this.parseWav(wavBuffer);

      return new BufferedAudioPlayable(audio, sampleRate);
    } finally {
      // Clean up temp file
      if (existsSync(tmpFile)) {
        unlinkSync(tmpFile);
      }
    }
  }

  private parseWav(buffer: Buffer): AudioResult {
    // Simple WAV parser - assumes 16-bit PCM
    // WAV header is typically 44 bytes
    const dataOffset = buffer.indexOf(Buffer.from('data')) + 8;
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);

    if (bitsPerSample !== 16) {
      throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
    }

    const pcmData = buffer.subarray(dataOffset);
    const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    return { audio: float32, sampleRate };
  }

  isReady(): boolean {
    return this.ready;
  }
}


