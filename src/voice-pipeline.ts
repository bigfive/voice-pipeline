/**
 * Voice Pipeline
 * Main orchestrator: STT → LLM → TTS
 *
 * STT and TTS are optional - omit them if the client handles them locally.
 * Supports tool registration for function calling with any LLM backend.
 */

import type {
  STTPipeline,
  LLMPipeline,
  TTSPipeline,
  Message,
  ProgressCallback,
  AudioPlayable,
  Tool,
  ToolDefinition,
  ToolCall,
  AssistantMessage,
  ToolMessage,
} from './types';
import { TextNormalizer } from './services/text-normalizer';

/** Maximum number of tool call iterations to prevent infinite loops */
const MAX_TOOL_ITERATIONS = 10;

export interface VoicePipelineConfig {
  /** STT backend (optional if client does local STT) */
  stt?: STTPipeline | null;
  /** LLM backend (required) */
  llm: LLMPipeline;
  /** TTS backend (optional if client does local TTS) */
  tts?: TTSPipeline | null;
  /** System prompt for the LLM */
  systemPrompt: string;
  /** Registered tools for function calling */
  tools?: Tool[];
}

export interface VoicePipelineCallbacks {
  onTranscript: (text: string) => void;
  onResponseChunk: (text: string) => void;
  onAudio: (playable: AudioPlayable) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  /** Called when a tool is being executed */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Called when a tool execution completes */
  onToolResult?: (toolCallId: string, result: unknown) => void;
}

export class VoicePipeline {
  private stt: STTPipeline | null;
  private llm: LLMPipeline;
  private tts: TTSPipeline | null;
  private systemPrompt: string;
  private textNormalizer = new TextNormalizer();
  private history: Message[] = [];
  private tools: Map<string, Tool> = new Map();
  private toolDefinitions: ToolDefinition[] = [];

  constructor(config: VoicePipelineConfig) {
    this.stt = config.stt ?? null;
    this.llm = config.llm;
    this.tts = config.tts ?? null;
    this.systemPrompt = config.systemPrompt;

    // Register tools
    if (config.tools) {
      for (const tool of config.tools) {
        this.registerTool(tool);
      }
    }

    // Build initial system prompt (may include tool instructions for non-native backends)
    this.history = [{ role: 'system', content: this.buildSystemPrompt() }];
  }

  /**
   * Register a tool for function calling
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.toolDefinitions.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });

    // Update system prompt if we're using prompt-based tools
    if (!this.llm.supportsTools?.()) {
      this.history[0] = { role: 'system', content: this.buildSystemPrompt() };
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.toolDefinitions = this.toolDefinitions.filter(t => t.name !== name);

    // Update system prompt
    if (!this.llm.supportsTools?.()) {
      this.history[0] = { role: 'system', content: this.buildSystemPrompt() };
    }
  }

  /**
   * Get registered tools
   */
  getTools(): ToolDefinition[] {
    return [...this.toolDefinitions];
  }

  /**
   * Build system prompt, optionally including tool instructions for non-native backends
   */
  private buildSystemPrompt(): string {
    // If LLM supports native tools or no tools registered, return base prompt
    if (this.llm.supportsTools?.() || this.toolDefinitions.length === 0) {
      return this.systemPrompt;
    }

    // For non-native backends, inject tool instructions into system prompt
    const toolsJson = JSON.stringify(
      this.toolDefinitions.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      null,
      2
    );

    return `${this.systemPrompt}

You have access to the following tools. When you need to use a tool, respond with ONLY a JSON object in this exact format (no other text):
{"tool_call": {"name": "tool_name", "arguments": {...}}}

Available tools:
${toolsJson}

After receiving a tool result, you may use another tool or provide your final response.
Only use tools when necessary. For simple questions, respond directly without tools.`;
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    const promises: Promise<void>[] = [this.llm.initialize(onProgress)];

    if (this.stt) {
      promises.push(this.stt.initialize(onProgress));
    }
    if (this.tts) {
      promises.push(this.tts.initialize(onProgress));
    }

    await Promise.all(promises);
  }

  isReady(): boolean {
    const sttReady = this.stt ? this.stt.isReady() : true;
    const ttsReady = this.tts ? this.tts.isReady() : true;
    return sttReady && this.llm.isReady() && ttsReady;
  }

  /**
   * Check if pipeline has STT configured
   */
  hasSTT(): boolean {
    return this.stt !== null;
  }

  /**
   * Check if pipeline has TTS configured
   */
  hasTTS(): boolean {
    return this.tts !== null;
  }

  /**
   * Process audio input (requires STT backend)
   */
  async processAudio(audio: Float32Array, callbacks: VoicePipelineCallbacks): Promise<void> {
    if (!this.stt) {
      callbacks.onError(new Error('No STT backend configured. Use processText() instead.'));
      return;
    }

    try {
      // 1. STT
      const transcript = await this.stt.transcribe(audio);
      if (!transcript.trim()) {
        callbacks.onError(new Error('Could not transcribe audio'));
        return;
      }
      callbacks.onTranscript(transcript);

      // 2. Process the transcript
      await this.processTranscript(transcript, callbacks);

      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Process text input (for when client does local STT)
   */
  async processText(text: string, callbacks: Omit<VoicePipelineCallbacks, 'onTranscript'>): Promise<void> {
    try {
      await this.processTranscript(text, {
        ...callbacks,
        onTranscript: () => {}, // No-op since client already has transcript
      });
      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Internal: Process a transcript through LLM and optionally TTS
   */
  private async processTranscript(transcript: string, callbacks: VoicePipelineCallbacks): Promise<void> {
    // Add to history
    this.history.push({ role: 'user', content: transcript });

    // LLM with optional streaming TTS
    await this.generateResponse(callbacks);
  }

  private async generateResponse(callbacks: VoicePipelineCallbacks): Promise<void> {
    const useNativeTools = (this.llm.supportsTools?.() ?? false) && this.toolDefinitions.length > 0;

    // Tool execution loop - may iterate multiple times if LLM requests tools
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await this.generateWithStreaming(callbacks, useNativeTools);

      // Check for tool calls
      const toolCalls = useNativeTools
        ? result.toolCalls
        : this.parsePromptBasedToolCalls(result.content);

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls - we're done
        // Add assistant response to history
        this.history.push({ role: 'assistant', content: result.content });
        return;
      }

      // Execute tool calls
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content: result.content,
        toolCalls,
      };
      this.history.push(assistantMsg);

      for (const toolCall of toolCalls) {
        callbacks.onToolCall?.(toolCall);

        const tool = this.tools.get(toolCall.name);
        if (!tool) {
          // Unknown tool - add error result
          const errorMsg: ToolMessage = {
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
          };
          this.history.push(errorMsg);
          callbacks.onToolResult?.(toolCall.id, { error: `Unknown tool: ${toolCall.name}` });
          continue;
        }

        try {
          const toolResult = await tool.execute(toolCall.arguments);
          const resultMsg: ToolMessage = {
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(toolResult),
          };
          this.history.push(resultMsg);
          callbacks.onToolResult?.(toolCall.id, toolResult);
        } catch (error) {
          const errorResult = { error: error instanceof Error ? error.message : String(error) };
          const errorMsg: ToolMessage = {
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(errorResult),
          };
          this.history.push(errorMsg);
          callbacks.onToolResult?.(toolCall.id, errorResult);
        }
      }

      // Continue loop to get LLM's response after tool results
    }

    // If we hit max iterations, add a warning
    console.warn('VoicePipeline: Max tool iterations reached');
  }

  /**
   * Generate LLM response with streaming and optional TTS
   */
  private async generateWithStreaming(
    callbacks: VoicePipelineCallbacks,
    useNativeTools: boolean
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    // Prepare TTS streaming state
    const hasTTS = !!this.tts;
    let sentenceBuffer = '';
    const sentenceEnders = /[.!?]/;
    const playableQueue = new Map<number, AudioPlayable>();
    let nextSentenceIndex = 0;
    let nextToSend = 0;
    const ttsPromises: Promise<void>[] = [];

    const flushPlayableQueue = () => {
      while (playableQueue.has(nextToSend)) {
        const playable = playableQueue.get(nextToSend)!;
        callbacks.onAudio(playable);
        playableQueue.delete(nextToSend);
        nextToSend++;
      }
    };

    const queueTTS = (sentence: string, index: number) => {
      const normalizedText = this.textNormalizer.normalize(sentence);
      const promise = this.tts!
        .synthesize(normalizedText)
        .then((playable) => {
          playableQueue.set(index, playable);
          flushPlayableQueue();
        })
        .catch(() => {
          nextToSend = Math.max(nextToSend, index + 1);
          flushPlayableQueue();
        });
      ttsPromises.push(promise);
    };

    // Generate with the LLM
    const result = await this.llm.generate(this.history, {
      tools: useNativeTools ? this.toolDefinitions : undefined,
      onToken: (token) => {
        callbacks.onResponseChunk(token);

        if (hasTTS) {
          sentenceBuffer += token;
          const match = sentenceBuffer.match(sentenceEnders);
          if (match && match.index !== undefined) {
            const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
            sentenceBuffer = sentenceBuffer.slice(match.index + 1);
            if (sentence) {
              queueTTS(sentence, nextSentenceIndex++);
            }
          }
        }
      },
      onToolCall: (toolCall) => {
        callbacks.onToolCall?.(toolCall);
      },
    });

    // Handle remaining text for TTS
    if (hasTTS && sentenceBuffer.trim()) {
      queueTTS(sentenceBuffer.trim(), nextSentenceIndex++);
    }

    // Wait for all TTS to complete
    if (ttsPromises.length > 0) {
      await Promise.all(ttsPromises);
    }

    return {
      content: result.content,
      toolCalls: result.toolCalls,
    };
  }

  /**
   * Parse tool calls from LLM output (for non-native tool backends)
   */
  private parsePromptBasedToolCalls(content: string): ToolCall[] | undefined {
    if (this.toolDefinitions.length === 0) {
      return undefined;
    }

    // Look for JSON tool call format: {"tool_call": {"name": "...", "arguments": {...}}}
    const toolCallPattern = /\{"tool_call"\s*:\s*\{[^}]+\}\s*\}/g;
    const matches = content.match(toolCallPattern);

    if (!matches) {
      return undefined;
    }

    const toolCalls: ToolCall[] = [];

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.tool_call?.name) {
          toolCalls.push({
            id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: parsed.tool_call.name,
            arguments: parsed.tool_call.arguments || {},
          });
        }
      } catch {
        // Skip malformed JSON
      }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
  }

  clearHistory(): void {
    this.history = [{ role: 'system', content: this.buildSystemPrompt() }];
  }

  getHistory(): Message[] {
    return [...this.history];
  }
}
