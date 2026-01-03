/**
 * Speech-to-Text using sherpa-onnx (Whisper)
 */

import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// @ts-expect-error - sherpa-onnx-node types
import * as sherpa from "sherpa-onnx-node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, "..", "models");

export class SpeechToText {
  private recognizer: sherpa.OfflineRecognizer;

  constructor() {
    console.log("Loading Whisper STT model...");

    const modelDir = join(MODELS_DIR, "sherpa-onnx-whisper-small.en");

    const config = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        whisper: {
          encoder: join(modelDir, "small.en-encoder.int8.onnx"),
          decoder: join(modelDir, "small.en-decoder.int8.onnx"),
        },
        tokens: join(modelDir, "small.en-tokens.txt"),
        numThreads: 4,
        provider: "cpu",
        debug: false,
      },
    };

    this.recognizer = new sherpa.OfflineRecognizer(config);
    console.log("✓ Whisper STT ready");
  }

  /**
   * Transcribe audio buffer to text
   * @param audioBuffer - Raw PCM audio (16-bit signed int)
   * @param sampleRate - Sample rate of the audio
   */
  transcribe(audioBuffer: Buffer, sampleRate: number = 16000): string {
    // Convert Buffer (16-bit PCM) to Float32Array
    const int16Array = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );

    const samples = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      samples[i] = int16Array[i] / 32768.0;
    }

    // Create stream and process
    const stream = this.recognizer.createStream();
    stream.acceptWaveform({ sampleRate, samples });

    this.recognizer.decode(stream);
    const result = this.recognizer.getResult(stream);

    return result.text?.trim() || "";
  }
}

