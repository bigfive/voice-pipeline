/**
 * WebSocket Client Service
 * Handles communication with the voice assistant server
 */

import type { ClientMessage, ServerMessage } from '../../shared/protocol';

export interface WebSocketClientConfig {
  url: string;
  reconnectDelay?: number;
}

export interface WebSocketClientCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: Error) => void;
}

export class WebSocketClient {
  private config: WebSocketClientConfig;
  private callbacks: WebSocketClientCallbacks;
  private ws: WebSocket | null = null;
  private _isConnected = false;

  constructor(config: WebSocketClientConfig, callbacks: WebSocketClientCallbacks = {}) {
    this.config = {
      reconnectDelay: 2000,
      ...config,
    };
    this.callbacks = callbacks;
  }

  /** Connect to the server */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this._isConnected = true;
        this.callbacks.onConnected?.();
        resolve();
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this._isConnected = false;
        this.callbacks.onDisconnected?.();
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        const error = new Error('WebSocket connection failed');
        this.callbacks.onError?.(error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.callbacks.onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };
    });
  }

  /** Disconnect from the server */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  /** Send a message to the server */
  send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /** Send audio chunk */
  sendAudio(data: ArrayBuffer, sampleRate: number): boolean {
    return this.send({
      type: 'audio',
      data: this.arrayBufferToBase64(data),
      sampleRate,
    });
  }

  /** Signal end of audio stream */
  sendEndAudio(): boolean {
    return this.send({ type: 'end_audio' });
  }

  /** Request to clear conversation history */
  sendClearHistory(): boolean {
    return this.send({ type: 'clear_history' });
  }

  /** Check if connected */
  isConnected(): boolean {
    return this._isConnected;
  }

  /** Convert ArrayBuffer to base64 string */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/** Convert base64 string to ArrayBuffer */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

