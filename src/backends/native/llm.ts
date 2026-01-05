/**
 * Llama LLM Pipeline (Native - llama.cpp)
 * Server-only - requires native binary
 *
 * Uses llama-simple for clean single-shot completions.
 * The binaryPath should point to llama-simple (not llama-cli).
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import type { LLMPipeline, NativeLLMConfig, ProgressCallback, Message } from '../../types';

export class NativeLlama implements LLMPipeline {
  private config: NativeLLMConfig;
  private ready = false;

  constructor(config: NativeLLMConfig) {
    this.config = config;
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log('Initializing native LLM (llama.cpp)...');

    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`llama-simple binary not found at: ${this.config.binaryPath}`);
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

    // Use llama-simple for clean single-shot completions
    // All debug output goes to stderr, only the completion goes to stdout
    // llama-simple syntax: llama-simple -m model.gguf [-n n_predict] [-ngl n_gpu_layers] [prompt]
    const args = [
      '-m', this.config.modelPath,
      '-n', String(this.config.maxNewTokens),
    ];

    if (this.config.gpuLayers) {
      args.push('-ngl', String(this.config.gpuLayers));
    }

    // Prompt must be last (positional argument)
    args.push(prompt);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let fullOutput = '';
      const promptLength = prompt.length;

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        fullOutput += chunk;

        // llama-simple outputs: {prompt}{completion}
        // We only want to stream the completion part (after the prompt)
        if (fullOutput.length > promptLength) {
          // Get just the new completion text
          const completionSoFar = fullOutput.slice(promptLength);
          const prevCompletion = (fullOutput.length - chunk.length > promptLength)
            ? fullOutput.slice(promptLength, -chunk.length)
            : '';
          const newText = completionSoFar.slice(prevCompletion.length);

          // Stream new characters, filtering out special tokens
          for (const char of newText) {
            onToken(char);
          }
        }
      });

      proc.stderr.on('data', () => {
        // Ignore stderr (Metal init messages, timing info, etc.)
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`llama-simple exited with code ${code}`));
          return;
        }

        // Extract just the completion (everything after the prompt)
        let completion = fullOutput.slice(promptLength);

        // Clean up: remove any trailing special tokens
        completion = completion
          .replace(/<\|im_end\|>/g, '')
          .replace(/<\|im_start\|>/g, '')
          .replace(/<\|endoftext\|>/g, '')
          .trim();

        resolve(completion);
      });

      proc.on('error', reject);
    });
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

