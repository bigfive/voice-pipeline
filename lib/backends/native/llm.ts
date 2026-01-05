/**
 * Llama LLM Pipeline (Native - llama.cpp)
 * Server-only - requires native binary
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import type { LLMPipeline, NativeLLMConfig, ProgressCallback, Message } from '../../types';

export class NativeLlamaPipeline implements LLMPipeline {
  private config: NativeLLMConfig;
  private ready = false;

  constructor(config: NativeLLMConfig) {
    this.config = config;
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing native LLM (llama.cpp)...');

    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`llama.cpp binary not found at: ${this.config.binaryPath}`);
    }
    if (!existsSync(this.config.modelPath)) {
      throw new Error(`LLM model not found at: ${this.config.modelPath}`);
    }

    this.ready = true;
    console.log('Native LLM ready.');
  }

  async generate(messages: Message[], onToken: (token: string) => void): Promise<string> {
    if (!this.ready) {
      throw new Error('LLM pipeline not initialized');
    }

    const prompt = this.formatChatPrompt(messages);
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    const gpuFlag = this.config.gpuLayers ? `-ngl ${this.config.gpuLayers}` : '';

    const result = execSync(
      `"${this.config.binaryPath}" ` +
      `-m "${this.config.modelPath}" ` +
      `-p '${escapedPrompt}' ` +
      `-n ${this.config.maxNewTokens} ` +
      `--temp ${this.config.temperature} ` +
      `${gpuFlag} ` +
      `--no-display-prompt ` +
      `--single-turn ` +      // Exit after one response
      `--log-disable`,        // Disable logging
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse response - extract text after the last ">" prompt marker and before stats
    let response = result.trim();

    // Find the actual response (after the prompt markers, before the stats)
    const lines = response.split('\n');
    const responseLines: string[] = [];
    let inResponse = false;

    for (const line of lines) {
      // Skip loading/banner lines
      if (line.includes('Loading model') || line.includes('▄') || line.includes('██') ||
          line.includes('build') || line.includes('modalities') || line.includes('available commands') ||
          line.includes('/exit') || line.includes('/regen') || line.includes('/clear') || line.includes('/read') ||
          line.startsWith('>') || line.includes('<|im_start|>') || line.includes('<|im_end|>')) {
        continue;
      }
      // Skip stats line
      if (line.includes('Prompt:') && line.includes('t/s')) continue;
      if (line.includes('Exiting...')) continue;
      // Collect actual response
      if (line.trim()) {
        responseLines.push(line.trim());
      }
    }

    response = responseLines.join(' ').trim();

    for (const char of response) {
      onToken(char);
    }

    return response;
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
      }
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  isReady(): boolean {
    return this.ready;
  }
}

