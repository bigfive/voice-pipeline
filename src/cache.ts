/**
 * Cache utilities for voice-pipeline
 * Models and binaries are stored in ~/.cache/voice-pipeline/ by default
 */

import { homedir } from 'os';
import { join } from 'path';

/**
 * Get the cache directory for voice-pipeline assets.
 * Default: ~/.cache/voice-pipeline
 * Override with VOICE_PIPELINE_CACHE environment variable.
 */
export function getCacheDir(): string {
  return process.env.VOICE_PIPELINE_CACHE || join(homedir(), '.cache', 'voice-pipeline');
}

/**
 * Get the path to the models directory
 */
export function getModelsDir(): string {
  return join(getCacheDir(), 'models');
}

/**
 * Get the path to the binaries directory
 */
export function getBinDir(): string {
  return join(getCacheDir(), 'bin');
}

/**
 * Default paths for native backends.
 * Use these when configuring NativeWhisperSTT, NativeLlama, NativeSherpaOnnxTTS.
 */
export const defaultPaths = {
  get whisper() {
    return {
      binaryPath: join(getBinDir(), 'whisper-cli'),
      modelPath: join(getModelsDir(), 'whisper-large-v3-turbo-q8.bin'),
    };
  },
  get llama() {
    return {
      binaryPath: join(getBinDir(), 'llama-simple'),
      modelPath: join(getModelsDir(), 'smollm2-1.7b-instruct-q4_k_m.gguf'),
    };
  },
  get sherpaOnnxTts() {
    return {
      binaryPath: join(getBinDir(), 'sherpa-onnx-offline-tts'),
      modelDir: join(getModelsDir(), 'vits-piper-en_US-lessac-medium'),
    };
  },
};
