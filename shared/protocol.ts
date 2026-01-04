/**
 * WebSocket protocol definitions
 * Defines all message types for client-server communication
 */

// ============ Client → Server Messages ============

/** Audio chunk from microphone */
export interface AudioMessage {
  type: 'audio';
  data: string; // base64 encoded Int16 PCM
  sampleRate: number;
}

/** Signal end of audio stream */
export interface EndAudioMessage {
  type: 'end_audio';
}

/** Request to clear conversation history */
export interface ClearHistoryMessage {
  type: 'clear_history';
}

/** Union of all client-to-server messages */
export type ClientMessage =
  | AudioMessage
  | EndAudioMessage
  | ClearHistoryMessage;

// ============ Server → Client Messages ============

/** Transcription result from STT */
export interface TranscriptMessage {
  type: 'transcript';
  text: string;
}

/** Streaming text chunk from LLM */
export interface ResponseTextMessage {
  type: 'response_text';
  text: string;
  done: boolean;
}

/** Audio chunk from TTS */
export interface AudioResponseMessage {
  type: 'audio';
  data: string; // base64 encoded Float32
  sampleRate: number;
  format: 'float32';
}

/** Signal processing complete */
export interface DoneMessage {
  type: 'done';
}

/** Error message */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** Confirmation of history cleared */
export interface HistoryClearedMessage {
  type: 'history_cleared';
}

/** Union of all server-to-client messages */
export type ServerMessage =
  | TranscriptMessage
  | ResponseTextMessage
  | AudioResponseMessage
  | DoneMessage
  | ErrorMessage
  | HistoryClearedMessage;

// ============ Type Guards ============

export function isClientMessage(msg: unknown): msg is ClientMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as { type?: string };
  return m.type === 'audio' || m.type === 'end_audio' || m.type === 'clear_history';
}

export function isAudioMessage(msg: ClientMessage): msg is AudioMessage {
  return msg.type === 'audio';
}

export function isEndAudioMessage(msg: ClientMessage): msg is EndAudioMessage {
  return msg.type === 'end_audio';
}

export function isClearHistoryMessage(msg: ClientMessage): msg is ClearHistoryMessage {
  return msg.type === 'clear_history';
}

