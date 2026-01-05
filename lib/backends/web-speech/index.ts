/**
 * Web Speech API TTS Pipeline
 * Browser-only - uses native browser speech synthesis
 */

import type { TTSPipeline, ProgressCallback, AudioResult } from '../../types';

export interface WebSpeechTTSConfig {
  voiceName?: string;      // e.g., "Martha", "Samantha", "Daniel"
  lang?: string;           // e.g., "en-US", "en-GB"
  rate?: number;           // 0.5 - 2.0, default 1.0
  pitch?: number;          // 0.5 - 2.0, default 1.0
  volume?: number;         // 0.0 - 1.0, default 1.0
}

export class WebSpeechTTSPipeline implements TTSPipeline {
  private config: WebSpeechTTSConfig;
  private voice: SpeechSynthesisVoice | null = null;
  private ready = false;

  constructor(config: WebSpeechTTSConfig = {}) {
    this.config = {
      voiceName: config.voiceName || 'Martha',
      lang: config.lang || 'en',
      rate: config.rate ?? 1.1,
      pitch: config.pitch ?? 0.6,
      volume: config.volume ?? 1.0,
    };
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing Web Speech TTS...');

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Web Speech API not available');
    }

    // Wait for voices to load
    await this.loadVoices();

    this.ready = true;
    console.log(`Web Speech TTS ready. Voice: ${this.voice?.name || 'default'}`);
  }

  private async loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const tryLoad = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          this.selectVoice(voices);
          resolve();
        }
      };

      // Try immediately
      tryLoad();

      // Also listen for voiceschanged (Chrome needs this)
      speechSynthesis.onvoiceschanged = () => {
        tryLoad();
      };

      // Timeout fallback
      setTimeout(() => resolve(), 1000);
    });
  }

  private selectVoice(voices: SpeechSynthesisVoice[]): void {
    // Try to find voice by name
    if (this.config.voiceName) {
      const byName = voices.find(v =>
        v.name.toLowerCase().includes(this.config.voiceName!.toLowerCase())
      );
      if (byName) {
        this.voice = byName;
        return;
      }
    }

    // Try to find by language
    if (this.config.lang) {
      const byLang = voices.find(v => v.lang.startsWith(this.config.lang!));
      if (byLang) {
        this.voice = byLang;
        return;
      }
    }

    // Fall back to default or first English voice
    this.voice = voices.find(v => v.default) ||
                 voices.find(v => v.lang.startsWith('en')) ||
                 voices[0] || null;
  }

  async synthesize(text: string): Promise<AudioResult> {
    if (!this.ready) {
      throw new Error('TTS pipeline not initialized');
    }

    // Web Speech API doesn't give us raw audio data,
    // so we return an empty array and handle playback via speak()
    // This is a limitation - the pipeline will need to call speak() instead
    return {
      audio: new Float32Array(0),
      sampleRate: 22050,
    };
  }

  /**
   * Speak text directly using Web Speech API
   * Use this instead of synthesize() for Web Speech
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        reject(new Error('TTS pipeline not initialized'));
        return;
      }

      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      if (this.voice) {
        utterance.voice = this.voice;
      }
      utterance.rate = this.config.rate!;
      utterance.pitch = this.config.pitch!;
      utterance.volume = this.config.volume!;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(new Error(`Speech error: ${e.error}`));

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop any ongoing speech
   */
  stop(): void {
    speechSynthesis.cancel();
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return speechSynthesis.speaking;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get available voices
   */
  static getVoices(): SpeechSynthesisVoice[] {
    return speechSynthesis.getVoices();
  }
}

