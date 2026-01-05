/**
 * WebSocket Protocol Types
 */

export type ClientMessage =
  | { type: 'audio'; data: string; sampleRate: number }
  | { type: 'end_audio' }
  | { type: 'clear_history' };

export type ServerMessage =
  | { type: 'transcript'; text: string }
  | { type: 'response_chunk'; text: string }
  | { type: 'audio'; data: string; sampleRate: number }
  | { type: 'complete' }
  | { type: 'error'; message: string };

