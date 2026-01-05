/**
 * Function Service
 * Registry and executor for LLM tool/function calls
 */

import type { ToolDefinition, FunctionCall, FunctionResult } from '../types';

export class FunctionService {
  private tools = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(call: FunctionCall): Promise<FunctionResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { name: call.name, result: `Unknown tool: "${call.name}"` };
    }

    try {
      const result = await tool.handler(call.arguments);
      return { name: call.name, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { name: call.name, result: `Error: ${message}` };
    }
  }

  formatForSystemPrompt(): string {
    const defs = this.getDefinitions();
    if (defs.length === 0) return '';

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
          required: def.parameters
            ? Object.entries(def.parameters)
                .filter(([, v]) => v.required)
                .map(([k]) => k)
            : [],
        },
      },
    }));

    let prompt = '\n\nYou have access to these tools:\n';
    prompt += JSON.stringify(tools, null, 2);
    prompt += '\n\nWhen you need to use a tool, respond with ONLY:\n';
    prompt += '<tool_call>[{"name": "function_name", "arguments": {}}]</tool_call>';

    return prompt;
  }
}

export function containsFunctionCall(text: string): boolean {
  return /<tool_call>/.test(text);
}

export function parseFunctionCall(text: string): FunctionCall {
  const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!match) {
    throw new Error('No <tool_call> tag found');
  }

  const parsed = JSON.parse(match[1].trim());

  if (Array.isArray(parsed)) {
    const call = parsed[0];
    return { name: call.name ?? call.function, arguments: call.arguments ?? {} };
  }

  return { name: parsed.name ?? parsed.function, arguments: parsed.arguments ?? {} };
}

