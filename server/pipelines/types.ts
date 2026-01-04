/**
 * Pipeline interface definitions
 * These abstractions allow swapping implementations
 */

import type { Message, AudioResult } from '../../shared/types';

/** Speech-to-Text pipeline interface */
export interface STTPipeline {
  /** Initialize the pipeline (load model) */
  initialize(): Promise<void>;

  /** Transcribe audio to text */
  transcribe(audio: Float32Array): Promise<string>;

  /** Check if pipeline is ready */
  isReady(): boolean;
}

/** Language Model pipeline interface */
export interface LLMPipeline {
  /** Initialize the pipeline (load model) */
  initialize(): Promise<void>;

  /** Generate a response given conversation history */
  generate(
    messages: Message[],
    onToken: (token: string) => void
  ): Promise<string>;

  /** Check if pipeline is ready */
  isReady(): boolean;
}

/** Text-to-Speech pipeline interface */
export interface TTSPipeline {
  /** Initialize the pipeline (load model) */
  initialize(): Promise<void>;

  /** Synthesize text to audio */
  synthesize(text: string): Promise<AudioResult>;

  /** Pre-cache audio for common phrases */
  precache(phrases: string[]): Promise<void>;

  /** Get cached audio if available, null otherwise */
  getCached(text: string): AudioResult | null;

  /** Check if pipeline is ready */
  isReady(): boolean;
}

/** Combined pipeline status */
export interface PipelinesReady {
  stt: boolean;
  llm: boolean;
  tts: boolean;
  all: boolean;
}

