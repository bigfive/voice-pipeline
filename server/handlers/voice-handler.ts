/**
 * Voice Handler
 * Handles WebSocket messages related to voice interactions
 */

import type {
  WebSocketConnection,
  ConnectionHandler,
  WebSocketServerWrapper,
} from '../infrastructure/websocket-server';
import type {
  ClientMessage,
  ServerMessage,
} from '../../shared/protocol';
import {
  isAudioMessage,
  isEndAudioMessage,
  isClearHistoryMessage,
} from '../../shared/protocol';
import type { VoiceService } from '../services/voice-service';
import type { ConversationService } from '../services/conversation-service';
import { pcmBufferToFloat32 } from '../pipelines/stt-pipeline';

/** Per-connection state */
interface ConnectionState {
  audioBuffer: Buffer[];
}

export class VoiceHandler implements ConnectionHandler {
  private wsServer!: WebSocketServerWrapper;
  private connectionStates = new Map<string, ConnectionState>();

  constructor(
    private voiceService: VoiceService,
    private conversationService: ConversationService
  ) {}

  /** Set the WebSocket server reference (called after construction) */
  setWebSocketServer(wsServer: WebSocketServerWrapper): void {
    this.wsServer = wsServer;
  }

  onConnect(connection: WebSocketConnection): void {
    // Initialize connection state
    this.connectionStates.set(connection.id, {
      audioBuffer: [],
    });

    // Create conversation for this connection
    this.conversationService.getOrCreateConversation(connection.id);
  }

  onDisconnect(connection: WebSocketConnection): void {
    // Clean up connection state
    this.connectionStates.delete(connection.id);

    // Optionally clean up conversation (or keep for reconnection)
    this.conversationService.deleteConversation(connection.id);
  }

  onError(connection: WebSocketConnection, error: Error): void {
    console.error(`Connection ${connection.id} error:`, error);
    this.send(connection.id, {
      type: 'error',
      message: error.message,
    });
  }

  async onMessage(
    connection: WebSocketConnection,
    message: ClientMessage
  ): Promise<void> {
    const state = this.connectionStates.get(connection.id);
    if (!state) {
      console.error(`No state for connection ${connection.id}`);
      return;
    }

    try {
      if (isAudioMessage(message)) {
        // Accumulate audio chunks
        const chunk = Buffer.from(message.data, 'base64');
        state.audioBuffer.push(chunk);
      } else if (isEndAudioMessage(message)) {
        await this.handleEndAudio(connection.id, state);
      } else if (isClearHistoryMessage(message)) {
        this.handleClearHistory(connection.id);
      }
    } catch (error) {
      console.error(`Error handling message for ${connection.id}:`, error);
      this.send(connection.id, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Handle end of audio stream - process through voice pipeline */
  private async handleEndAudio(
    connectionId: string,
    state: ConnectionState
  ): Promise<void> {
    if (state.audioBuffer.length === 0) {
      this.send(connectionId, {
        type: 'error',
        message: 'No audio received',
      });
      return;
    }

    // Combine audio chunks
    const fullAudio = Buffer.concat(state.audioBuffer);
    state.audioBuffer = [];

    // Convert to Float32 for STT
    const audioFloat32 = pcmBufferToFloat32(fullAudio);

    // Process through voice pipeline
    await this.voiceService.processAudio(connectionId, audioFloat32, {
      onTranscript: (text) => {
        this.send(connectionId, {
          type: 'transcript',
          text,
        });
      },

      onResponseChunk: (text) => {
        this.send(connectionId, {
          type: 'response_text',
          text,
          done: false,
        });
      },

      onResponseComplete: (_fullText) => {
        this.send(connectionId, {
          type: 'response_text',
          text: '',
          done: true,
        });
      },

      onAudio: (audio, _index) => {
        const buffer = Buffer.from(audio.audio.buffer);
        this.send(connectionId, {
          type: 'audio',
          data: buffer.toString('base64'),
          sampleRate: audio.sampleRate,
          format: 'float32',
        });
      },

      onComplete: () => {
        this.send(connectionId, { type: 'done' });
      },

      onError: (error) => {
        this.send(connectionId, {
          type: 'error',
          message: error.message,
        });
      },
    });
  }

  /** Handle clear history request */
  private handleClearHistory(connectionId: string): void {
    this.conversationService.clearHistory(connectionId);
    this.send(connectionId, { type: 'history_cleared' });
  }

  /** Send a message to a connection */
  private send(connectionId: string, message: ServerMessage): void {
    if (this.wsServer) {
      this.wsServer.send(connectionId, message);
    }
  }
}

