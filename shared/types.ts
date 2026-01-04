/**
 * Shared domain types for the voice assistant
 */

/** Role in a conversation */
export type MessageRole = 'system' | 'user' | 'assistant';

/** A single message in a conversation */
export interface Message {
  role: MessageRole;
  content: string;
  timestamp?: number;
}

/** A conversation session with history */
export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/** Audio data result from TTS */
export interface AudioResult {
  audio: Float32Array;
  sampleRate: number;
}

/** Audio format specification */
export interface AudioFormat {
  sampleRate: number;
  channels: number;
  format: 'int16' | 'float32';
}

/** Pipeline initialization status */
export interface PipelineStatus {
  stt: boolean;
  llm: boolean;
  tts: boolean;
}

/** Application state for the client */
export type AppState =
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';

/** State labels for UI display */
export const STATE_LABELS: Record<AppState, string> = {
  connecting: 'Connecting...',
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
};

