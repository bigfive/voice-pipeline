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
  speakerEmbeddings: string;
}

export interface ServerConfig {
  port: number;
  stt: STTConfig;
  llm: LLMConfig;
  tts: TTSConfig;
}

/** Default configuration */
export const config: ServerConfig = {
  port: Number(process.env.PORT) || 8000,

  stt: {
    model: process.env.STT_MODEL || 'Xenova/whisper-small',
    dtype: 'q8',
    language: 'en',
  },

  llm: {
    model: process.env.LLM_MODEL || 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    dtype: 'q4',
    systemPrompt:
      process.env.SYSTEM_PROMPT ||
      'You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. ' +
      'Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked.',
    maxNewTokens: Number(process.env.MAX_TOKENS) || 200,
    temperature: Number(process.env.TEMPERATURE) || 0.7,
  },

  tts: {
    model: process.env.TTS_MODEL || 'Xenova/speecht5_tts',
    speakerEmbeddings:
      process.env.SPEAKER_EMBEDDINGS ||
      'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin',
  },
};

