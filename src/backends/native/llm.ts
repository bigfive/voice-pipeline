/**
 * Llama LLM Pipeline (Native - llama.cpp)
 * Server-only - requires native binary (llama-completion)
 *
 * When tools are provided, uses GBNF grammar to guarantee valid JSON tool calls.
 * A special "respond" tool is automatically added - the model must call this to reply.
 *
 * Uses SmolLM2/HuggingFace standard tool call format:
 * <tool_call>[{"name": "func", "arguments": {...}}]</tool_call>
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  LLMPipeline,
  NativeLLMConfig,
  ProgressCallback,
  Message,
  LLMGenerateOptions,
  LLMGenerateResult,
  ToolDefinition,
  AssistantMessage,
} from '../../types';
import { LLMLogger, LLMConversationTracker, type TrackerMessage } from '../../services';

/** Special "respond" tool that signals completion */
const RESPOND_TOOL: ToolDefinition = {
  name: 'respond',
  description: 'Call this to respond to the user with your final answer. Most requests only require this tool. You MUST call this when you are ready to reply.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Your response message to the user',
      },
    },
    required: ['message'],
  },
};

export class NativeLlama implements LLMPipeline {
  private config: NativeLLMConfig;
  private ready = false;
  private tracker: LLMConversationTracker;

  constructor(config: NativeLLMConfig) {
    this.config = config;
    this.tracker = new LLMConversationTracker(new LLMLogger());
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing native LLM (llama-completion)...');

    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`llama-completion binary not found at: ${this.config.binaryPath}`);
    }
    if (!existsSync(this.config.modelPath)) {
      throw new Error(`LLM model not found at: ${this.config.modelPath}`);
    }

    this.ready = true;
    console.log('Native LLM ready.');
  }

  supportsTools(): boolean {
    return true;
  }

  async generate(messages: Message[], options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    if (!this.ready) {
      throw new Error('LLM pipeline not initialized');
    }

    // If tools are provided, use grammar mode for guaranteed valid JSON
    if (options?.tools && options.tools.length > 0) {
      return this.generateWithGrammar(messages, options);
    }

    // No tools: regular freeform generation
    return this.generateFreeform(messages, options);
  }


  /**
   * Build the tool system prompt
   */
  private buildToolSystemPrompt(tools: ToolDefinition[]): string {
    const toolsJson = JSON.stringify(
      tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      null,
      2
    );

    return `You have access to tools:
<tools>${toolsJson}</tools>

- Most user requests only require a "respond" tool call to answer the question directly
- Some user requests may require other tools first.

The output MUST strictly adhere to the following format. Use the "respond" tool for direct answers and to end the conversation.
<tool_call>[
{"name": "func_name1", "arguments": {"argument1": "value1", "argument2": "value2"}}
]</tool_call>`;
  }

  /**
   * Generate with GBNF grammar constraint - guarantees valid JSON tool calls
   * Uses SmolLM2/HuggingFace format: <tool_call>[{...}]</tool_call>
   */
  private async generateWithGrammar(
    messages: Message[],
    options: LLMGenerateOptions
  ): Promise<LLMGenerateResult> {
    // Add the "respond" tool to the tool list (respond is always available)
    const allTools = [...(options.tools ?? []), RESPOND_TOOL];

    // Build grammar for tool calls
    const grammar = this.buildToolGrammar(allTools);

    // Write grammar to temp file (llama-completion needs a file path)
    const grammarPath = join(tmpdir(), `grammar-${Date.now()}.gbnf`);
    writeFileSync(grammarPath, grammar);

    try {
      const prompt = this.formatChatPromptWithTools(messages, allTools);

      // llama-completion args for clean non-interactive output
      const args = [
        '-m', this.config.modelPath,
        '-n', String(this.config.maxNewTokens),
        '--temp', String(this.config.temperature ?? 0.7),
        '--grammar-file', grammarPath,
        '--no-display-prompt',  // Don't echo the prompt back
        '--simple-io',          // Clean output without ANSI codes
        '-no-cnv',              // Non-conversation mode (single completion)
        '-p', prompt,
      ];

      if (this.config.gpuLayers) {
        args.push('-ngl', String(this.config.gpuLayers));
      }

      const output = await this.runLlamaCompletion(args, messages, options);

      // Parse the tool call array from <tool_call>[...]</tool_call> format
      const toolCalls = this.parseToolCallOutput(output);

      if (!toolCalls || toolCalls.length === 0) {
        // No valid tool calls found
        return {
          content: output,
          finishReason: 'stop',
        };
      }

      // Check if it's the "respond" tool (special case - not a real tool call)
      const firstCall = toolCalls[0];
      if (firstCall.name === 'respond') {
        const message = (firstCall.arguments?.message as string) || '';
        return {
          content: message,
          finishReason: 'stop',
        };
      }

      // Regular tool call - return for execution
      return {
        content: '',
        toolCalls: toolCalls.map((tc, i) => ({
          id: `native-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          name: tc.name,
          arguments: tc.arguments || {},
        })),
        finishReason: 'tool_calls',
      };
    } finally {
      // Clean up temp grammar file
      try {
        unlinkSync(grammarPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Parse tool call output in SmolLM2/HuggingFace format
   * <tool_call>[{"name": "...", "arguments": {...}}]</tool_call>
   */
  private parseToolCallOutput(output: string): Array<{ name: string; arguments: Record<string, unknown> }> | null {
    // Try to extract JSON array from <tool_call>...</tool_call> tags
    const tagMatch = output.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
    const jsonStr = tagMatch ? tagMatch[1] : output;

    try {
      const parsed = JSON.parse(jsonStr.trim());

      // Handle array format
      if (Array.isArray(parsed)) {
        return parsed.filter(tc => tc && typeof tc.name === 'string');
      }

      // Handle single object format (legacy)
      if (parsed && typeof parsed.name === 'string') {
        return [parsed];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build GBNF grammar for SmolLM2/HuggingFace tool call format
   * Output: <tool_call>[{"name": "...", "arguments": {...}}]</tool_call>
   */
  private buildToolGrammar(tools: ToolDefinition[]): string {
    // Build tool name alternatives: "get_weather" | "search" | "respond"
    const toolNames = tools.map(t => `"\\"${t.name}\\""`).join(' | ');

    return `# Grammar for SmolLM2/HuggingFace tool calling format
# Output: <tool_call>[{"name": "...", "arguments": {...}}]</tool_call>

root ::= "<tool_call>" ws tool-array ws "</tool_call>"

tool-array ::= "[" ws tool-obj ws "]"

tool-obj ::= "{" ws "\\"name\\":" ws tool-name "," ws "\\"arguments\\":" ws arguments ws "}"

tool-name ::= ${toolNames}

arguments ::= "{" ws (keyval ("," ws keyval)*)? ws "}"
keyval ::= string ":" ws value

value ::= string | number | bool | null | object | array
string ::= "\\"" chars "\\""
chars ::= char*
char ::= [^"\\\\\\x00-\\x1f] | "\\\\" escape
escape ::= ["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
bool ::= "true" | "false"
null ::= "null"
object ::= "{" ws (keyval ("," ws keyval)*)? ws "}"
array ::= "[" ws (value ("," ws value)*)? ws "]"

ws ::= [ \\t\\n]*
`;
  }

  /**
   * Format chat prompt with tool definitions (for grammar mode)
   * Uses SmolLM2/HuggingFace tool prompt format
   */
  private formatChatPromptWithTools(messages: Message[], tools: ToolDefinition[]): string {
    const toolSystemPrompt = this.buildToolSystemPrompt(tools);

    let prompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Combine system prompt with tool instructions
        prompt += `<|im_start|>system\n${msg.content}\n\n${toolSystemPrompt}<|im_end|>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'assistant') {
        const assistantMsg = msg as AssistantMessage;
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          // Format tool calls in SmolLM2 format
          const toolCallJson = JSON.stringify(
            assistantMsg.toolCalls.map(tc => ({
              name: tc.name,
              arguments: tc.arguments,
            }))
          );
          prompt += `<|im_start|>assistant\n<tool_call>${toolCallJson}</tool_call><|im_end|>\n`;
        } else {
          prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
        }
      } else if (msg.role === 'tool') {
        prompt += `<|im_start|>tool\n${msg.content}<|im_end|>\n`;
      }
    }

    // If no system message was in history, add tool prompt as system
    if (!messages.some(m => m.role === 'system')) {
      prompt = `<|im_start|>system\n${toolSystemPrompt}<|im_end|>\n` + prompt;
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  /** Special tokens to filter from output */
  private static readonly SPECIAL_TOKENS = /\[end of text\]|<\|im_end\|>|<\|im_start\|>|<\|endoftext\|>/gi;

  /**
   * Run llama-completion and capture output
   * Output goes to stdout, debug/timing info goes to stderr (ignored)
   */
  private runLlamaCompletion(args: string[], messages: Message[], options?: LLMGenerateOptions): Promise<string> {
    // Log the input messages (use conversation ID if provided, else default)
    const conversationId = options?.conversationId ?? 'default';
    this.tracker.logInput(conversationId, messages as TrackerMessage[]);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;

        // Stream tokens if callback provided, filtering out special markers
        // llama.cpp sends special tokens as complete strings, not split across chunks
        if (options?.onToken) {
          const filtered = chunk.replace(NativeLlama.SPECIAL_TOKENS, '');
          for (const char of filtered) {
            options.onToken(char);
          }
        }
      });

      proc.stderr.on('data', () => {
        // Ignore stderr (Metal init messages, timing info, etc.)
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`llama-completion exited with code ${code}`));
          return;
        }

        // Clean up output - remove special tokens
        const cleaned = output.replace(NativeLlama.SPECIAL_TOKENS, '').trim();
        this.tracker.logRawOutput(conversationId, cleaned);
        resolve(cleaned);
      });

      proc.on('error', reject);
    });
  }

  /**
   * Freeform generation (no grammar) - used when no tools are provided
   */
  private async generateFreeform(
    messages: Message[],
    options?: LLMGenerateOptions
  ): Promise<LLMGenerateResult> {
    const prompt = this.formatChatPrompt(messages);

    // llama-completion args for clean non-interactive output
    const args = [
      '-m', this.config.modelPath,
      '-n', String(this.config.maxNewTokens),
      '--temp', String(this.config.temperature ?? 0.7),
      '--no-display-prompt',  // Don't echo the prompt back
      '--simple-io',          // Clean output without ANSI codes
      '-no-cnv',              // Non-conversation mode (single completion)
      '-p', prompt,
    ];

    if (this.config.gpuLayers) {
      args.push('-ngl', String(this.config.gpuLayers));
    }

    const output = await this.runLlamaCompletion(args, messages, options);

    return {
      content: output,
      finishReason: 'stop',
    };
  }

  /**
   * Format basic chat prompt (for non-tool mode)
   */
  private formatChatPrompt(messages: Message[]): string {
    let prompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'tool') {
        prompt += `<|im_start|>tool\n${msg.content}<|im_end|>\n`;
      }
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  isReady(): boolean {
    return this.ready;
  }
}
