/**
 * LLM client for Ollama
 */

interface OllamaConfig {
  baseUrl: string;
  model: string;
  systemPrompt: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OllamaClient {
  private config: OllamaConfig;
  private history: Message[] = [];

  constructor(config: OllamaConfig) {
    this.config = config;
    this.initHistory();
  }

  private initHistory(): void {
    this.history = [{ role: "system", content: this.config.systemPrompt }];
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *chatStream(userMessage: string): AsyncGenerator<string> {
    this.history.push({ role: "user", content: userMessage });

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages: this.history,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullResponse += json.message.content;
            yield json.message.content;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    this.history.push({ role: "assistant", content: fullResponse });
  }

  clearHistory(): void {
    this.initHistory();
  }
}

