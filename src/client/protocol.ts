/**
 * WebSocket Protocol Types for Voice Pipeline
 *
 * Shared types for client-server communication.
 */

// ============ Client → Server ============

export type AudioMessage = {
  type: 'audio';
  data: string; // base64-encoded Float32Array
  sampleRate: number;
};

export type EndAudioMessage = {
  type: 'end_audio';
};

export type ClearHistoryMessage = {
  type: 'clear_history';
};

/**
 * Text message - sent when client does STT locally
 * Server skips STT and goes straight to LLM
 */
export type TextMessage = {
  type: 'text';
  text: string;
};

/**
 * Capabilities message - sent on connect to tell server what client handles
 */
export type CapabilitiesMessage = {
  type: 'capabilities';
  hasSTT: boolean;  // Client does STT locally
  hasTTS: boolean;  // Client does TTS locally
};

export type ClientMessage = AudioMessage | EndAudioMessage | ClearHistoryMessage | TextMessage | CapabilitiesMessage;

// ============ Server → Client ============

export type TranscriptMessage = {
  type: 'transcript';
  text: string;
};

export type ResponseChunkMessage = {
  type: 'response_chunk';
  text: string;
};

export type AudioResponseMessage = {
  type: 'audio';
  data: string; // base64-encoded Float32Array
  sampleRate: number;
};

/**
 * Sent when a tool call is being executed
 */
export type ToolCallMessage = {
  type: 'tool_call';
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Sent when a tool call completes
 */
export type ToolResultMessage = {
  type: 'tool_result';
  toolCallId: string;
  result: unknown;
};

export type CompleteMessage = {
  type: 'complete';
};

export type ErrorMessage = {
  type: 'error';
  message: string;
};

export type ServerMessage =
  | TranscriptMessage
  | ResponseChunkMessage
  | AudioResponseMessage
  | ToolCallMessage
  | ToolResultMessage
  | CompleteMessage
  | ErrorMessage;

// ============ Encoding Utilities ============

/**
 * Encode Float32Array to base64 string
 */
export function float32ToBase64(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to Float32Array
 */
export function base64ToFloat32(data: string): Float32Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

