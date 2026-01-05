/**
 * Cloud LLM Pipeline (OpenAI-compatible API)
 * Works with: OpenAI, Ollama, vLLM, LMStudio, and any OpenAI-compatible endpoint
 *
 * Uses native fetch with streaming - no external dependencies required.
 */

import type { LLMPipeline, CloudLLMConfig, ProgressCallback, Message } from '../../types';

export class CloudLLM implements LLMPipeline {
  private config: CloudLLMConfig;
  private ready = false;

  constructor(config: CloudLLMConfig) {
    this.config = {
      maxTokens: 256,
      temperature: 0.7,
      ...config,
    };
  }

  async initialize(_onProgress?: ProgressCallback): Promise<void> {
    console.log(`Initializing Cloud LLM (${this.config.baseUrl})...`);
    console.log(`  Model: ${this.config.model}`);

    // Validate the endpoint is reachable (optional health check)
    try {
      const modelsUrl = `${this.config.baseUrl}/models`;
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        // Some endpoints don't have /models, that's okay
        console.log('  Note: /models endpoint not available (this is fine for some providers)');
      } else {
        console.log('  API endpoint verified.');
      }
    } catch (error) {
      // Connection errors are fine during init - we'll fail at generate time if needed
      console.log('  Note: Could not verify API endpoint (will retry on first request)');
    }

    this.ready = true;
    console.log('Cloud LLM ready.');
  }

  async generate(messages: Message[], onToken: (token: string) => void): Promise<string> {
    if (!this.ready) {
      throw new Error('LLM pipeline not initialized');
    }

    const url = `${this.config.baseUrl}/chat/completions`;

    const body = {
      model: this.config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud LLM API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              const content = delta.content;
              fullResponse += content;
              onToken(content);
            }
          } catch {
            // Skip malformed JSON lines (can happen with some providers)
          }
        }
      }
    }

    return fullResponse;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  isReady(): boolean {
    return this.ready;
  }
}

