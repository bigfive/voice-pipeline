/**
 * Text-to-Speech using sherpa-onnx (Piper)
 */

import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// @ts-expect-error - sherpa-onnx-node types
import * as sherpa from "sherpa-onnx-node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, "models");

export interface AudioResult {
  samples: Buffer;
  sampleRate: number;
}

export class TextToSpeech {
  private tts: sherpa.OfflineTts;
  private sampleRate: number;

  constructor() {
    console.log("Loading Piper TTS model...");

    const modelDir = join(MODELS_DIR, "vits-piper-en_US-lessac-medium");

    const config = {
      model: {
        vits: {
          model: join(modelDir, "en_US-lessac-medium.onnx"),
          tokens: join(modelDir, "tokens.txt"),
          dataDir: join(modelDir, "espeak-ng-data"),
        },
        debug: false,
        numThreads: 2,
        provider: "cpu",
      },
      maxNumSentences: 1,
    };

    this.tts = new sherpa.OfflineTts(config);
    this.sampleRate = 22050; // Piper models typically output at 22050 Hz
    console.log("✓ Piper TTS ready");
  }

  /**
   * Synthesize text to audio
   * @param text - Text to synthesize
   * @param speed - Speech speed (1.0 = normal)
   */
  synthesize(text: string, speed: number = 1.0): AudioResult {
    const audio = this.tts.generate({
      text,
      sid: 0, // speaker ID
      speed,
    });

    // Convert Float32Array to 16-bit PCM Buffer
    const samples = new Int16Array(audio.samples.length);
    for (let i = 0; i < audio.samples.length; i++) {
      const s = Math.max(-1, Math.min(1, audio.samples[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return {
      samples: Buffer.from(samples.buffer),
      sampleRate: audio.sampleRate || this.sampleRate,
    };
  }
}

