/**
 * Function Service
 * Registry and executor for LLM function calls
 * Uses SmolLM2's native tool_call format
 */

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description: string }>;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionResult {
  name: string;
  result: string;
}

/**
 * Parse a function call from LLM output
 * Supports SmolLM2's native format: <tool_call>[{"name": "fn", "arguments": {}}]</tool_call>
 * Throws if the tool_call tag exists but content is malformed
 */
export function parseFunctionCall(text: string): FunctionCall {
  // Match <tool_call>...</tool_call> content
  const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!match) {
    throw new Error('No <tool_call> tag found in text');
  }

  const content = match[1].trim();
  const parsed = JSON.parse(content);

  // Handle array format: [{"name": "fn", "arguments": {}}]
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error('Empty tool_call array');
    }
    const call = parsed[0];
    const name = call.name ?? call.function;
    if (!name) {
      throw new Error('Tool call missing "name" field');
    }
    return {
      name,
      arguments: call.arguments ?? call.parameters ?? {},
    };
  }

  // Handle object format: {"name": "fn", "arguments": {}}
  const name = parsed.name ?? parsed.function;
  if (!name) {
    throw new Error('Tool call missing "name" field');
  }
  return {
    name,
    arguments: parsed.arguments ?? parsed.parameters ?? {},
  };
}

/** Check if text contains a function call */
export function containsFunctionCall(text: string): boolean {
  return /<tool_call>/.test(text);
}

/** Extract text before and after function call */
export function extractTextAroundFunctionCall(text: string): {
  before: string;
  after: string;
} {
  const match = text.match(/([\s\S]*?)<tool_call>[\s\S]*?<\/tool_call>([\s\S]*)/);
  if (!match) {
    return { before: text, after: '' };
  }
  return {
    before: match[1].trim(),
    after: match[2].trim(),
  };
}

export class FunctionService {
  private functions = new Map<string, {
    definition: FunctionDefinition;
    handler: (args: Record<string, unknown>) => string | Promise<string>;
  }>();

  constructor() {
    // Register built-in functions
    this.registerBuiltInFunctions();
  }

  private registerBuiltInFunctions(): void {
    // Get current date and time
    this.register(
      {
        name: 'get_current_datetime',
        description: 'Get the current date and time. Call this when the user asks what time it is, what the date is, or anything about current date/time.',
        parameters: {},
      },
      () => {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        };
        return now.toLocaleDateString('en-US', options);
      }
    );
  }

  /** Register a new function */
  register(
    definition: FunctionDefinition,
    handler: (args: Record<string, unknown>) => string | Promise<string>
  ): void {
    this.functions.set(definition.name, { definition, handler });
  }

  /** Get all function definitions for the system prompt */
  getDefinitions(): FunctionDefinition[] {
    return Array.from(this.functions.values()).map((f) => f.definition);
  }

  /** Format function definitions for the system prompt (SmolLM2 format) */
  formatForSystemPrompt(): string {
    const defs = this.getDefinitions();
    if (defs.length === 0) return '';

    // Format tools in JSON Schema style that SmolLM2 was trained on
    const tools = defs.map((def) => ({
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: {
          type: 'object',
          properties: def.parameters
            ? Object.fromEntries(
                Object.entries(def.parameters).map(([k, v]) => [
                  k,
                  { type: v.type, description: v.description },
                ])
              )
            : {},
          required: [],
        },
      },
    }));

    let prompt = '\n\nYou have access to these tools:\n';
    prompt += JSON.stringify(tools, null, 2);
    prompt += '\n\nWhen you need to use a tool, respond with ONLY a tool call in this exact format:\n';
    prompt += '<tool_call>[{"name": "function_name", "arguments": {}}]</tool_call>\n';
    prompt += '\nDo not add any text before or after the tool call. The result will be provided to you.';

    return prompt;
  }

  /** Execute a function call */
  async execute(call: FunctionCall): Promise<FunctionResult> {
    const fn = this.functions.get(call.name);
    if (!fn) {
      throw new Error(`Unknown function: "${call.name}"`);
    }

    const result = await fn.handler(call.arguments);
    return { name: call.name, result };
  }

  /** Check if a function exists */
  hasFunction(name: string): boolean {
    return this.functions.has(name);
  }
}
