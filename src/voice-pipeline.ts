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

/** Default filler phrases while executing tools */
const DEFAULT_TOOL_FILLER_PHRASES = [
  'Let me check that for you.',
  'One moment please.',
  'Let me look that up.',
];

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
  /** 
   * Filler phrases to say while executing tools.
   * Set to empty array to disable filler phrases.
   * @default ["Let me check that for you.", "One moment please.", "Let me look that up."]
   */
  toolFillerPhrases?: string[];
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
  private toolFillerPhrases: string[];
  private fillerPhraseIndex = 0;

  constructor(config: VoicePipelineConfig) {
    this.stt = config.stt ?? null;
    this.llm = config.llm;
    this.tts = config.tts ?? null;
    this.systemPrompt = config.systemPrompt;
    this.toolFillerPhrases = config.toolFillerPhrases ?? DEFAULT_TOOL_FILLER_PHRASES;

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

You have access to tools. When you need to use a tool, respond with ONLY this JSON (no other text before or after):
{"tool_call": {"name": "tool_name", "arguments": {...}}}

Available tools:
${toolsJson}

IMPORTANT: 
- If using a tool, respond ONLY with the JSON tool_call object, nothing else.
- After you receive a tool result, provide your natural language response to the user.
- Only use tools when necessary. For simple questions, respond directly.`;
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
    const hasTools = this.toolDefinitions.length > 0;

    // Tool execution loop - may iterate multiple times if LLM requests tools
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const isToolCheckTurn = hasTools && iteration === 0;
      
      // For prompt-based tools on first turn, don't stream (need to check for tool call JSON)
      // For native tools, we can check tool_calls in result without streaming issues
      const shouldStream = !isToolCheckTurn || useNativeTools;
      
      const result = await this.generateLLMResponse(
        callbacks,
        useNativeTools,
        shouldStream && !useNativeTools // Only stream if not using native tools (native handles tool calls separately)
      );

      // Check for tool calls
      const toolCalls = useNativeTools
        ? result.toolCalls
        : this.parsePromptBasedToolCalls(result.content);

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls - stream the response if we haven't already
        if (!shouldStream || useNativeTools) {
          // Stream the content now (we buffered it)
          await this.streamResponse(result.content, callbacks);
        }
        
        // Add assistant response to history
        this.history.push({ role: 'assistant', content: result.content });
        return;
      }

      // Tool call detected - say filler phrase while we execute
      if (this.toolFillerPhrases.length > 0) {
        const fillerPhrase = this.toolFillerPhrases[this.fillerPhraseIndex % this.toolFillerPhrases.length];
        this.fillerPhraseIndex++;
        await this.streamResponse(fillerPhrase, callbacks);
      }

      // Add assistant message with tool calls to history (don't include raw JSON for prompt-based)
      const assistantContent = useNativeTools ? result.content : '';
      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content: assistantContent,
        toolCalls,
      };
      this.history.push(assistantMsg);

      // Execute tool calls
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
      // Next iteration will stream the final response
    }

    // If we hit max iterations, add a warning
    console.warn('VoicePipeline: Max tool iterations reached');
  }

  /**
   * Stream a response to the client with optional TTS
   */
  private async streamResponse(content: string, callbacks: VoicePipelineCallbacks): Promise<void> {
    if (!content) return;

    // Stream text chunks
    callbacks.onResponseChunk(content);

    // TTS if available
    if (this.tts) {
      const normalizedText = this.textNormalizer.normalize(content);
      if (normalizedText) {
        const playable = await this.tts.synthesize(normalizedText);
        callbacks.onAudio(playable);
      }
    }
  }

  /**
   * Generate LLM response, optionally with streaming
   */
  private async generateLLMResponse(
    callbacks: VoicePipelineCallbacks,
    useNativeTools: boolean,
    shouldStream: boolean
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    // If streaming with TTS, use sentence-by-sentence streaming
    if (shouldStream && this.tts) {
      return this.generateWithStreamingTTS(callbacks, useNativeTools);
    }

    // If streaming without TTS, just stream tokens
    if (shouldStream) {
      const result = await this.llm.generate(this.history, {
        tools: useNativeTools ? this.toolDefinitions : undefined,
        onToken: (token) => callbacks.onResponseChunk(token),
      });
      return { content: result.content, toolCalls: result.toolCalls };
    }

    // No streaming - just get the result (used for tool call detection)
    const result = await this.llm.generate(this.history, {
      tools: useNativeTools ? this.toolDefinitions : undefined,
    });
    return { content: result.content, toolCalls: result.toolCalls };
  }

  /**
   * Generate LLM response with streaming TTS (sentence by sentence)
   */
  private async generateWithStreamingTTS(
    callbacks: VoicePipelineCallbacks,
    useNativeTools: boolean
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
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

    const result = await this.llm.generate(this.history, {
      tools: useNativeTools ? this.toolDefinitions : undefined,
      onToken: (token) => {
        callbacks.onResponseChunk(token);
        sentenceBuffer += token;
        
        const match = sentenceBuffer.match(sentenceEnders);
        if (match && match.index !== undefined) {
          const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
          sentenceBuffer = sentenceBuffer.slice(match.index + 1);
          if (sentence) {
            queueTTS(sentence, nextSentenceIndex++);
          }
        }
      },
    });

    // Handle remaining text
    if (sentenceBuffer.trim()) {
      queueTTS(sentenceBuffer.trim(), nextSentenceIndex++);
    }

    // Wait for all TTS to complete
    if (ttsPromises.length > 0) {
      await Promise.all(ttsPromises);
    }

    return { content: result.content, toolCalls: result.toolCalls };
  }

  /**
   * Parse tool calls from LLM output (for non-native tool backends)
   */
  private parsePromptBasedToolCalls(content: string): ToolCall[] | undefined {
    if (this.toolDefinitions.length === 0) {
      return undefined;
    }

    // Check if the content looks like a tool call (starts with { and contains "tool_call")
    const trimmed = content.trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"tool_call"')) {
      return undefined;
    }

    // Try to parse the entire content as a tool call JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.tool_call?.name) {
        return [{
          id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: parsed.tool_call.name,
          arguments: parsed.tool_call.arguments || {},
        }];
      }
    } catch {
      // Not valid JSON, try to extract tool call with regex
    }

    // Fallback: try to extract JSON object from content
    // This handles cases where there's extra text around the JSON
    const jsonMatch = content.match(/\{[\s\S]*"tool_call"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool_call?.name) {
          return [{
            id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: parsed.tool_call.name,
            arguments: parsed.tool_call.arguments || {},
          }];
        }
      } catch {
        // Skip malformed JSON
      }
    }

    return undefined;
  }

  clearHistory(): void {
    this.history = [{ role: 'system', content: this.buildSystemPrompt() }];
  }

  getHistory(): Message[] {
    return [...this.history];
  }
}
