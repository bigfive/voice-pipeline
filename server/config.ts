/**
 * Server configuration
 * Centralized configuration for all server components
 */

export interface STTConfig {
  model: string;
  dtype: string;
  language: string;
}

export interface LLMConfig {
  model: string;
  dtype: string;
  systemPrompt: string;
  maxNewTokens: number;
  temperature: number;
}

export interface TTSConfig {
  model: string;
  dtype: string;
  speakerEmbeddings: string;
}

export interface ServerConfig {
  port: number;
  stt: STTConfig;
  llm: LLMConfig;
  tts: TTSConfig;
  /** Phrases to pre-cache for instant TTS playback */
  precachedPhrases: string[];
}

/** Phrase spoken while executing a function call */
export const THINKING_PHRASE = 'Let me check for you.';

/** Default configuration */
export const config: ServerConfig = {
  port: 8000,

  stt: {
    model: 'Xenova/whisper-small',
    dtype: 'q8',
    language: 'en',
  },

  llm: {
    model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    dtype: 'q4',
    systemPrompt:
      'You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. ' +
      'Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations.',
    maxNewTokens: 140,
    temperature: 0.7,
  },

  tts: {
    model: 'Xenova/speecht5_tts',
    dtype: 'fp16',
    speakerEmbeddings:
      'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin',
  },

  precachedPhrases: [THINKING_PHRASE],
};