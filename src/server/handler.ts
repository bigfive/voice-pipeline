/**
 * Pipeline Handler
 *
 * Framework-agnostic session handler for voice pipeline servers.
 * Supports capability negotiation - skips STT/TTS when client handles them.
 * Each session has its own conversation history and conversation ID.
 */

import type { VoicePipeline, ConversationContext } from '../voice-pipeline';
import type { ClientMessage, ServerMessage } from '../client/protocol';
import type { Message } from '../types';
import { float32ToBase64Node, base64ToFloat32Node, concatFloat32Arrays } from './encoding';

export interface PipelineHandlerConfig {
  // Config options can be added here in the future
}

/**
 * Client capabilities - what the client handles locally
 */
interface ClientCapabilities {
  hasSTT: boolean;  // Client does STT - server won't send transcript
  hasTTS: boolean;  // Client does TTS - server won't send audio
}

/**
 * Generate a unique conversation ID
 */
function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * A session represents a single client connection.
 * Each session has its own conversation history and ID.
 */
export class PipelineSession {
  private audioChunks: Float32Array[] = [];
  private destroyed = false;
  private capabilities: ClientCapabilities = {
    hasSTT: false,
    hasTTS: false,
  };

  /** Session's conversation history */
  private history: Message[] = [];
  /** Unique conversation ID for this session */
  private conversationId: string;

  constructor(
    private pipeline: VoicePipeline
  ) {
    this.conversationId = generateConversationId();
    // Initialize history with system prompt
    this.history = [{ role: 'system', content: this.pipeline.getSystemPrompt() }];
  }

  /**
   * Get the conversation context for this session
   */
  private getContext(): ConversationContext {
    return {
      conversationId: this.conversationId,
      history: this.history,
    };
  }

  /**
   * Handle an incoming message and yield response messages
   */
  async *handle(message: ClientMessage): AsyncGenerator<ServerMessage> {
    if (this.destroyed) return;

    switch (message.type) {
      case 'capabilities':
        // Client is telling us what it handles locally
        this.capabilities = {
          hasSTT: message.hasSTT,
          hasTTS: message.hasTTS,
        };
        break;

      case 'audio':
        this.audioChunks.push(base64ToFloat32Node(message.data));
        break;

      case 'end_audio':
        yield* this.processAudio();
        break;

      case 'text':
        // Client did STT locally - process text directly
        yield* this.processText(message.text);
        break;

      case 'clear_history':
        // Reset session history and get a new conversation ID
        this.conversationId = generateConversationId();
        this.history = [{ role: 'system', content: this.pipeline.getSystemPrompt() }];
        break;
    }
  }

  /**
   * Get client capabilities
   */
  getCapabilities(): ClientCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Process accumulated audio through the pipeline (STT → LLM → TTS)
   */
  private async *processAudio(): AsyncGenerator<ServerMessage> {
    if (this.audioChunks.length === 0) return;

    if (!this.pipeline.hasSTT()) {
      yield { type: 'error', message: 'No STT backend configured on server. Client should use local STT and send text.' };
      return;
    }

    const audio = concatFloat32Arrays(this.audioChunks);
    this.audioChunks = [];

    yield* this.runPipeline((callbacks) =>
      this.pipeline.processAudio(audio, this.getContext(), callbacks)
    );
  }

  /**
   * Process text through the pipeline (LLM → TTS)
   */
  private async *processText(text: string): AsyncGenerator<ServerMessage> {
    // Emit the transcript so client knows what was received
    // (useful for debugging, client can ignore if it already has transcript)
    yield { type: 'transcript', text };

    yield* this.runPipeline((callbacks) =>
      this.pipeline.processText(text, this.getContext(), callbacks)
    );
  }

  /**
   * Run the pipeline and yield messages as they arrive
   */
  private async *runPipeline(
    run: (callbacks: Parameters<VoicePipeline['processAudio']>[2]) => Promise<Message[]>
  ): AsyncGenerator<ServerMessage> {
    const messageQueue: ServerMessage[] = [];
    let resolveWaiting: (() => void) | null = null;
    let isComplete = false;

    const enqueue = (msg: ServerMessage) => {
      messageQueue.push(msg);
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    };

    // Determine what to skip based on client capabilities
    const skipTTS = this.capabilities.hasTTS || !this.pipeline.hasTTS();

    // Start pipeline processing
    const pipelinePromise = run({
      onTranscript: (text) => enqueue({ type: 'transcript', text }),
      onResponseChunk: (text) => enqueue({ type: 'response_chunk', text }),
      onAudio: (playable) => {
        // Skip audio if client handles TTS locally
        if (skipTTS) return;

        const raw = playable.getRawAudio();
        if (!raw) {
          // TTS backend doesn't provide raw audio (e.g., WebSpeechTTS)
          // This is a config error - server TTS must produce raw audio
          enqueue({
            type: 'error',
            message: 'Server TTS backend does not provide raw audio. Use a TTS backend that produces raw audio (TransformersTTS, NativeTTS), or configure client with localTTS.',
          });
          isComplete = true;
          return;
        }
        enqueue({
          type: 'audio',
          data: float32ToBase64Node(raw.audio),
          sampleRate: raw.sampleRate,
        });
      },
      onToolCall: (toolCall) => {
        enqueue({
          type: 'tool_call',
          toolCallId: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        });
      },
      onToolResult: (toolCallId, result) => {
        enqueue({
          type: 'tool_result',
          toolCallId,
          result,
        });
      },
      onComplete: () => {
        enqueue({ type: 'complete' });
        isComplete = true;
      },
      onError: (err) => {
        enqueue({ type: 'error', message: err.message });
        isComplete = true;
      },
    });

    // Yield messages as they arrive
    while (!isComplete || messageQueue.length > 0) {
      if (messageQueue.length > 0) {
        yield messageQueue.shift()!;
      } else if (!isComplete) {
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    }

    await pipelinePromise;
  }

  /**
   * Clean up session resources
   */
  destroy(): void {
    this.destroyed = true;
    this.audioChunks = [];
  }
}

/**
 * Pipeline handler factory
 */
export class PipelineHandler {
  constructor(
    private pipeline: VoicePipeline,
    _config: PipelineHandlerConfig = {}
  ) {
    // Config reserved for future options
  }

  /**
   * Create a new session for a client connection.
   * Each session has its own conversation history.
   */
  createSession(): PipelineSession {
    return new PipelineSession(this.pipeline);
  }

  /**
   * Get info about what the pipeline handles
   */
  getPipelineInfo(): { hasSTT: boolean; hasTTS: boolean } {
    return {
      hasSTT: this.pipeline.hasSTT(),
      hasTTS: this.pipeline.hasTTS(),
    };
  }
}

/**
 * Create a pipeline handler
 */
export function createPipelineHandler(
  pipeline: VoicePipeline,
  config?: PipelineHandlerConfig
): PipelineHandler {
  return new PipelineHandler(pipeline, config);
}
