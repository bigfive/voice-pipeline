/**
 * SmolLM LLM Pipeline (Transformers.js)
 * Isomorphic - works in browser (WebGPU) and Node.js
 *
 * Note: This backend does not support native tool calling.
 * Tool support is handled at the VoicePipeline level via prompt injection.
 */

import { pipeline } from '@huggingface/transformers';
import type {
  LLMPipeline,
  TransformersLLMConfig,
  ProgressCallback,
  Message,
  LLMGenerateOptions,
  LLMGenerateResult,
  ToolMessage,
} from '../../types';

export class SmolLM implements LLMPipeline {
  private config: TransformersLLMConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null;
  private ready = false;

  constructor(config: TransformersLLMConfig) {
    this.config = config;
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    console.log(`Loading LLM model (${this.config.model})...`);

    this.pipe = await pipeline('text-generation', this.config.model, {
      dtype: this.config.dtype as 'fp32' | 'fp16' | 'q8' | 'q4',
      device: this.config.device,
      progress_callback: onProgress,
    });

    this.ready = true;
    console.log('LLM model loaded.');
  }

  supportsTools(): boolean {
    // Transformers backend doesn't support tool calling natively
    // Tools are handled via prompt injection at the VoicePipeline level
    return false;
  }

  async generate(messages: Message[], options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    if (!this.pipe) {
      throw new Error('LLM pipeline not initialized');
    }

    const prompt = this.formatChatPrompt(messages);

    const result = await this.pipe(prompt, {
      max_new_tokens: this.config.maxNewTokens,
      do_sample: true,
      temperature: this.config.temperature,
      return_full_text: false,
    });

    let response = result[0]?.generated_text?.trim() || '';
    response = response.replace(/<\|im_end\|>.*$/s, '').trim();

    // Stream character by character
    for (const char of response) {
      options?.onToken?.(char);
    }

    return {
      content: response,
      finishReason: 'stop',
    };
  }

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
        const toolMsg = msg as ToolMessage;
        prompt += `<|im_start|>tool\n[Tool Result: ${toolMsg.toolCallId}]\n${msg.content}<|im_end|>\n`;
      }
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  isReady(): boolean {
    return this.ready;
  }
}

