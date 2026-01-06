/**
 * LLM Logger Service
 *
 * Provides structured, backend-agnostic logging for LLM interactions.
 * Backends emit structured events, the logger handles all formatting.
 */

// ============================================================================
// Structured Log Events
// ============================================================================

export type LLMLogEvent =
  | { type: 'new_conversation' }
  | { type: 'llm_call_start'; isFirstCall: boolean }
  | { type: 'llm_call_output' }
  | { type: 'llm_call_end' }
  | { type: 'system'; content: string }
  | { type: 'user'; content: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; content: string }
  | { type: 'assistant'; content: string }
  | { type: 'response'; content: string }
  | { type: 'error'; message: string };

// ============================================================================
// Message Interface (matches the library's Message type)
// ============================================================================

/** Message interface for the tracker - mirrors the library's Message type */
export interface TrackerMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolCallId?: string;
}

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * Formats and displays structured LLM log events
 * All formatting (colors, icons, layout) is centralized here
 */
export class LLMLogger {
  private static readonly COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
  };

  private static readonly ICONS = {
    system: '⚙',
    user: '👤',
    toolCall: '🔧',
    toolResult: '✓',
    response: '💬',
    error: '✗',
    arrow: '→',
  };

  private enabled: boolean;

  constructor(options: { enabled?: boolean } = {}) {
    this.enabled = options.enabled ?? true;
  }

  /**
   * Log a structured event
   */
  log(event: LLMLogEvent): void {
    if (!this.enabled) return;

    const { COLORS: C, ICONS } = LLMLogger;

    switch (event.type) {
      case 'new_conversation':
        console.log(`\n${C.cyan}━━━━━━━━━━━━━━ NEW CONVERSATION ━━━━━━━━━━━━━━${C.reset}`);
        break;

      case 'llm_call_start':
        console.log(`\n${C.dim}┌───────────────────────────────────────────────${C.reset}`);
        if (event.isFirstCall) {
          console.log(`${C.dim}│${C.reset} ${C.cyan}LLM${C.reset}`);
        } else {
          console.log(`${C.dim}│${C.reset} ${C.cyan}LLM${C.reset} ${C.dim}(continued)${C.reset}`);
        }
        console.log(`${C.dim}├───────────────────────────────────────────────${C.reset}`);
        break;

      case 'llm_call_output':
        console.log(`${C.dim}├─────────────────── ${C.reset}${C.cyan}output${C.reset} ${C.dim}─────────────────${C.reset}`);
        break;

      case 'llm_call_end':
        console.log(`${C.dim}└───────────────────────────────────────────────${C.reset}\n`);
        break;

      case 'system': {
        const lines = event.content.split('\n');
        console.log(`${C.dim}│${C.reset} ${ICONS.system} ${C.magenta}SYSTEM${C.reset}`);
        for (const line of lines) {
          console.log(`${C.dim}│${C.reset}   ${C.dim}${line}${C.reset}`);
        }
        break;
      }

      case 'user':
        console.log(`${C.dim}│${C.reset} ${ICONS.user} ${C.yellow}USER${C.reset}: ${event.content}`);
        break;

      case 'tool_call': {
        const argsStr = this.formatArgs(event.args);
        console.log(`${C.dim}│${C.reset} ${ICONS.arrow} ${ICONS.toolCall} ${C.blue}${event.name}${C.reset}(${C.dim}${argsStr}${C.reset})`);
        break;
      }

      case 'tool_result':
        console.log(`${C.dim}│${C.reset} ${ICONS.toolResult} ${C.green}RESULT${C.reset}: ${C.dim}${event.content}${C.reset}`);
        break;

      case 'assistant':
        console.log(`${C.dim}│${C.reset} ${ICONS.response} ${C.green}ASSISTANT${C.reset}: ${event.content}`);
        break;

      case 'response':
        console.log(`${C.dim}│${C.reset} ${ICONS.arrow} ${ICONS.response} ${event.content}`);
        break;

      case 'error':
        console.log(`${C.dim}│${C.reset} ${ICONS.error} ${C.red}ERROR${C.reset}: ${event.message}`);
        break;
    }
  }

  /**
   * Format tool arguments for display
   */
  private formatArgs(args: Record<string, unknown>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// ============================================================================
// Unified Conversation Tracker
// ============================================================================

/**
 * Per-conversation tracking state
 */
interface ConversationState {
  loggedMessages: string[];
  callCount: number;
}

/**
 * Tracks conversation state and emits structured events for new messages.
 * Works with Message[] arrays directly - used by all backends.
 * Supports multiple simultaneous conversations via conversation IDs.
 */
export class LLMConversationTracker {
  private conversations = new Map<string, ConversationState>();
  private logger: LLMLogger;

  constructor(logger: LLMLogger) {
    this.logger = logger;
  }

  /**
   * Get or create state for a conversation
   */
  private getState(conversationId: string): ConversationState {
    let state = this.conversations.get(conversationId);
    if (!state) {
      // New conversation!
      state = { loggedMessages: [], callCount: 0 };
      this.conversations.set(conversationId, state);
      this.logger.log({ type: 'new_conversation' });
    }
    return state;
  }

  /**
   * Process messages array and emit events for new messages
   */
  logInput(conversationId: string, messages: TrackerMessage[]): void {
    const state = this.getState(conversationId);

    // Find which messages are new
    const newMessages: TrackerMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msgKey = this.messageKey(messages[i]);
      if (i >= state.loggedMessages.length || state.loggedMessages[i] !== msgKey) {
        newMessages.push(messages[i]);
        state.loggedMessages[i] = msgKey;
      }
    }
    state.loggedMessages.length = messages.length;

    const isFirstCall = state.callCount === 0;
    state.callCount++;

    // Emit events
    this.logger.log({ type: 'llm_call_start', isFirstCall });

    for (const msg of newMessages) {
      this.emitMessageEvent(msg);
    }
  }

  /**
   * Log an LLM response (text content and/or tool calls)
   */
  logOutput(conversationId: string, content: string, toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>): void {
    // Ensure conversation exists (in case logOutput is called without logInput)
    this.getState(conversationId);

    this.logger.log({ type: 'llm_call_output' });

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        // Handle the special "respond" tool from native backend
        if (tc.name === 'respond' && tc.arguments.message) {
          this.logger.log({ type: 'response', content: tc.arguments.message as string });
        } else {
          this.logger.log({ type: 'tool_call', name: tc.name, args: tc.arguments });
        }
      }
    } else if (content) {
      this.logger.log({ type: 'response', content });
    }

    this.logger.log({ type: 'llm_call_end' });
  }

  /**
   * Log a raw response string (for backends that return tool calls as formatted strings)
   * Parses <tool_call> tags and handles accordingly
   */
  logRawOutput(conversationId: string, response: string): void {
    const toolCall = this.parseToolCall(response);

    if (toolCall) {
      this.logOutput(conversationId, '', [toolCall]);
    } else {
      this.logOutput(conversationId, response);
    }
  }

  /**
   * Remove a conversation's tracking state (called when session ends)
   */
  removeConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Reset tracker state for a specific conversation
   */
  resetConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Reset all tracker state (e.g., for testing)
   */
  reset(): void {
    this.conversations.clear();
  }

  /**
   * Generate a unique key for a message (for deduplication)
   */
  private messageKey(msg: TrackerMessage): string {
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      return `${msg.role}:toolcalls:${JSON.stringify(msg.toolCalls)}`;
    }
    return `${msg.role}:${msg.content}`;
  }

  /**
   * Emit the appropriate log event for a message
   */
  private emitMessageEvent(msg: TrackerMessage): void {
    switch (msg.role) {
      case 'system':
        this.logger.log({ type: 'system', content: msg.content });
        break;

      case 'user':
        this.logger.log({ type: 'user', content: msg.content });
        break;

      case 'assistant':
        // Skip assistant messages in input - they're our previous outputs
        // We don't need to show them again
        break;

      case 'tool':
        this.logger.log({ type: 'tool_result', content: msg.content });
        break;
    }
  }

  /**
   * Parse tool call from SmolLM2/HuggingFace format: <tool_call>[...]</tool_call>
   */
  private parseToolCall(content: string): { name: string; arguments: Record<string, unknown> } | null {
    const match = content.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1].trim());
      const call = Array.isArray(parsed) ? parsed[0] : parsed;
      return { name: call.name, arguments: call.arguments || {} };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Singleton instance for convenience
// ============================================================================

let defaultLogger: LLMLogger | null = null;
let defaultTracker: LLMConversationTracker | null = null;

/**
 * Get the default logger instance (creates one if needed)
 */
export function getDefaultLogger(): LLMLogger {
  if (!defaultLogger) {
    defaultLogger = new LLMLogger();
  }
  return defaultLogger;
}

/**
 * Get the default tracker instance (creates one if needed)
 */
export function getDefaultTracker(): LLMConversationTracker {
  if (!defaultTracker) {
    defaultTracker = new LLMConversationTracker(getDefaultLogger());
  }
  return defaultTracker;
}

