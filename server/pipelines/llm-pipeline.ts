/**
 * Language Model Pipeline
 * Uses Gemma via Transformers.js for text generation
 */

import { pipeline } from '@huggingface/transformers';
import type { LLMConfig } from '../config';
import type { LLMPipeline } from './types';
import type { Message } from '../../shared/types';

export class GemmaLLMPipeline implements LLMPipeline {
  private config: LLMConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: LLMConfig) {
    this.config = config;
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

    const prompt = this.formatChatPrompt(messages);

    // Generate response
    const result = await this.pipe(prompt, {
      max_new_tokens: this.config.maxNewTokens,
      do_sample: true,
      temperature: this.config.temperature,
      return_full_text: false,
    });

    let response = result[0]?.generated_text?.trim() || '';
    
    // Clean up any trailing turn markers
    response = response.replace(/<end_of_turn>.*$/s, '').trim();

    // Send response character by character for streaming effect
    for (const char of response) {
      onToken(char);
    }

    return response;
  }

  /** Format messages using Gemma chat template */
  private formatChatPrompt(messages: Message[]): string {
    let prompt = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemma doesn't have a dedicated system role, prepend to first user message
        // or include as a user turn with context
        prompt += `<start_of_turn>user\nSystem: ${msg.content}<end_of_turn>\n`;
      } else if (msg.role === 'user') {
        prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
      }
    }

    prompt += '<start_of_turn>model\n';
    return prompt;
  }

  isReady(): boolean {
    return this.ready;
  }
}

// Keep backward compatibility alias
export { GemmaLLMPipeline as SmolLMPipeline };

