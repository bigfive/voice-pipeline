/**
 * Web Speech STT (Browser Speech Recognition)
 *
 * Uses the browser's native SpeechRecognition API for speech-to-text.
 * Client-side only - sends text to server instead of audio.
 */

export interface WebSpeechSTTConfig {
  /** Language code (e.g., 'en-US', 'en-GB') */
  language?: string;
  /** Whether to return interim results while speaking */
  interimResults?: boolean;
  /** Maximum alternatives to return */
  maxAlternatives?: number;
}

export type WebSpeechSTTResult = {
  transcript: string;
  isFinal: boolean;
  confidence: number;
};

// Cross-browser SpeechRecognition
const SpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export class WebSpeechSTT {
  private config: Required<WebSpeechSTTConfig>;
  private recognition: any = null;
  private isListening = false;
  private onResultCallback: ((result: WebSpeechSTTResult) => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(config: WebSpeechSTTConfig = {}) {
    this.config = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? false,
      maxAlternatives: config.maxAlternatives ?? 1,
    };
  }

  /**
   * Check if Web Speech API is available
   */
  static isSupported(): boolean {
    return SpeechRecognition !== null;
  }

  /**
   * Check if currently listening
   */
  get listening(): boolean {
    return this.isListening;
  }

  /**
   * Set callback for speech results
   */
  onResult(callback: (result: WebSpeechSTTResult) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Set callback for when recognition ends
   */
  onEnd(callback: () => void): void {
    this.onEndCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Start listening for speech
   */
  start(): void {
    if (!SpeechRecognition) {
      this.onErrorCallback?.(new Error('Web Speech API not supported in this browser'));
      return;
    }

    if (this.isListening) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.config.language;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;
    this.recognition.continuous = false; // Single utterance mode

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const alternative = result[0];

      this.onResultCallback?.({
        transcript: alternative.transcript,
        isFinal: result.isFinal,
        confidence: alternative.confidence,
      });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onEndCallback?.();
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      // 'no-speech' and 'aborted' are not really errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.onErrorCallback?.(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    this.isListening = true;
    this.recognition.start();
  }

  /**
   * Stop listening
   */
  stop(): void {
    if (!this.isListening || !this.recognition) return;
    this.recognition.stop();
    this.isListening = false;
  }

  /**
   * Abort recognition (doesn't return results)
   */
  abort(): void {
    if (!this.recognition) return;
    this.recognition.abort();
    this.isListening = false;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.abort();
    this.recognition = null;
    this.onResultCallback = null;
    this.onEndCallback = null;
    this.onErrorCallback = null;
  }
}

