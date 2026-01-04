/**
 * Language Model Pipeline
 * Uses SmolLM2 via Transformers.js for text generation
 */

import { pipeline } from '@huggingface/transformers';
import type { LLMConfig } from '../config';
import type { LLMPipeline } from './types';
import type { Message } from '../../shared/types';
import {
  FunctionService,
  parseFunctionCall,
  containsFunctionCall,
} from '../services/function-service';
import { THINKING_PHRASE } from '../config';

export class SmolLMPipeline implements LLMPipeline {
  private config: LLMConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;
  private functionService: FunctionService;

  constructor(config: LLMConfig, functionService?: FunctionService) {
    this.config = config;
    this.functionService = functionService ?? new FunctionService();
  }

  async initialize(): Promise<void> {
    console.log(`Loading LLM model (${this.config.model})...`);

    this.pipe = await pipeline('text-generation', this.config.model, {
      dtype: this.config.dtype as 'fp32' | 'fp16' | 'q8' | 'q4',
    });

    this.ready = true;
    console.log('LLM model loaded.');
  }

  async generate(
    messages: Message[],
    onToken: (token: string) => void
  ): Promise<string> {
    if (!this.pipe) {
      throw new Error('LLM pipeline not initialized');
    }

    // Add function definitions to the system prompt
    const messagesWithFunctions = this.injectFunctionDefinitions(messages);

    // First pass: generate (may return a tool call)
    const firstResponse = await this.generateRaw(messagesWithFunctions);

    // Check for function call
    if (containsFunctionCall(firstResponse)) {
      const functionCall = parseFunctionCall(firstResponse);
      console.log(`Function call detected: ${functionCall.name}`);

      // Say thinking phrase while the tool executes
      for (const char of THINKING_PHRASE) {
        onToken(char);
      }

      // Execute the function
      const functionResult = await this.functionService.execute(functionCall);
      console.log(`Function result: ${functionResult.result}`);

      // Find the original user question
      const userMessages = messages.filter((m) => m.role === 'user');
      const originalQuestion = userMessages[userMessages.length - 1]?.content ?? '';

      // Second pass: fresh conversation to answer with the tool result
      const answerMessages: Message[] = [
        {
          role: 'system',
          content:
            `Answer the user's question using this information: ${functionResult.result}\n\n` +
            'Keep your response brief and conversational. Do not use markdown or lists.',
        },
        {
          role: 'user',
          content: originalQuestion,
        },
      ];

      const answer = await this.generateRaw(answerMessages);

      // Stream the answer (with leading space)
      onToken(' ');
      for (const char of answer) {
        onToken(char);
      }

      return THINKING_PHRASE + ' ' + answer;
    }

    // No function call - stream the response normally
    for (const char of firstResponse) {
      onToken(char);
    }

    return firstResponse;
  }

  /** Generate a raw response without streaming */
  private async generateRaw(messages: Message[]): Promise<string> {
    const prompt = this.formatChatPrompt(messages);

    const result = await this.pipe(prompt, {
      max_new_tokens: this.config.maxNewTokens,
      do_sample: true,
      temperature: this.config.temperature,
      return_full_text: false,
    });

    let response = result[0]?.generated_text?.trim() || '';
    response = response.replace(/<\|im_end\|>.*$/s, '').trim();

    return response;
  }

  /** Inject function definitions into the system message */
  private injectFunctionDefinitions(messages: Message[]): Message[] {
    const functionPrompt = this.functionService.formatForSystemPrompt();
    if (!functionPrompt) return messages;

    return messages.map((msg, idx) => {
      if (idx === 0 && msg.role === 'system') {
        return {
          ...msg,
          content: msg.content + functionPrompt,
        };
      }
      return msg;
    });
  }

  /** Format messages using ChatML template (used by SmolLM2) */
  private formatChatPrompt(messages: Message[]): string {
    let prompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
      }
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  isReady(): boolean {
    return this.ready;
  }
}
