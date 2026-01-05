/**
 * Voice Pipeline
 * Main orchestrator: STT → LLM → TTS
 */

import type { STTPipeline, LLMPipeline, TTSPipeline, Message, ProgressCallback } from './types';
import { TextNormalizer } from './services/text-normalizer';

export interface VoicePipelineConfig {
  stt: STTPipeline;
  llm: LLMPipeline;
  tts: TTSPipeline;
  systemPrompt: string;
}

export interface VoicePipelineCallbacks {
  onTranscript: (text: string) => void;
  onResponseChunk: (text: string) => void;
  onAudio: (audio: Float32Array, sampleRate: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export class VoicePipeline {
  private stt: STTPipeline;
  private llm: LLMPipeline;
  private tts: TTSPipeline;
  private systemPrompt: string;
  private textNormalizer = new TextNormalizer();
  private history: Message[] = [];

  constructor(config: VoicePipelineConfig) {
    this.stt = config.stt;
    this.llm = config.llm;
    this.tts = config.tts;
    this.systemPrompt = config.systemPrompt;
    this.history = [{ role: 'system', content: this.systemPrompt }];
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    await Promise.all([
      this.stt.initialize(onProgress),
      this.llm.initialize(onProgress),
      this.tts.initialize(onProgress),
    ]);
  }

  isReady(): boolean {
    return this.stt.isReady() && this.llm.isReady() && this.tts.isReady();
  }

  async processAudio(audio: Float32Array, callbacks: VoicePipelineCallbacks): Promise<void> {
    try {
      // 1. STT
      const transcript = await this.stt.transcribe(audio);
      if (!transcript.trim()) {
        callbacks.onError(new Error('Could not transcribe audio'));
        return;
      }
      callbacks.onTranscript(transcript);

      // 2. Add to history
      this.history.push({ role: 'user', content: transcript });

      // 3. LLM with streaming TTS
      await this.generateWithStreamingTTS(callbacks);

      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async generateWithStreamingTTS(callbacks: VoicePipelineCallbacks): Promise<void> {
    let sentenceBuffer = '';
    const sentenceEnders = /[.!?]/;

    const audioQueue = new Map<number, { audio: Float32Array; sampleRate: number }>();
    let nextSentenceIndex = 0;
    let nextToSend = 0;
    const ttsPromises: Promise<void>[] = [];

    const flushAudioQueue = () => {
      while (audioQueue.has(nextToSend)) {
        const { audio, sampleRate } = audioQueue.get(nextToSend)!;
        callbacks.onAudio(audio, sampleRate);
        audioQueue.delete(nextToSend);
        nextToSend++;
      }
    };

    const queueTTS = (sentence: string, index: number) => {
      const normalizedText = this.textNormalizer.normalize(sentence);
      const promise = this.tts
        .synthesize(normalizedText)
        .then((result) => {
          audioQueue.set(index, result);
          flushAudioQueue();
        })
        .catch(() => {
          nextToSend = Math.max(nextToSend, index + 1);
          flushAudioQueue();
        });
      ttsPromises.push(promise);
    };

    const fullResponse = await this.llm.generate(this.history, (token) => {
      sentenceBuffer += token;
      callbacks.onResponseChunk(token);

      const match = sentenceBuffer.match(sentenceEnders);
      if (match && match.index !== undefined) {
        const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
        sentenceBuffer = sentenceBuffer.slice(match.index + 1);
        if (sentence) {
          queueTTS(sentence, nextSentenceIndex++);
        }
      }
    });

    // Handle remaining text
    if (sentenceBuffer.trim()) {
      queueTTS(sentenceBuffer.trim(), nextSentenceIndex++);
    }

    await Promise.all(ttsPromises);

    // Add to history
    this.history.push({ role: 'assistant', content: fullResponse });
  }

  clearHistory(): void {
    this.history = [{ role: 'system', content: this.systemPrompt }];
  }

  getHistory(): Message[] {
    return [...this.history];
  }
}

