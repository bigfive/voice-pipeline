/**
 * Voice Pipeline
 * Main orchestrator: STT → LLM → TTS
 *
 * STT and TTS are optional - omit them if the client handles them locally.
 */

import type { STTPipeline, LLMPipeline, TTSPipeline, Message, ProgressCallback, AudioPlayable } from './types';
import { TextNormalizer } from './services/text-normalizer';

export interface VoicePipelineConfig {
  /** STT backend (optional if client does local STT) */
  stt?: STTPipeline | null;
  /** LLM backend (required) */
  llm: LLMPipeline;
  /** TTS backend (optional if client does local TTS) */
  tts?: TTSPipeline | null;
  /** System prompt for the LLM */
  systemPrompt: string;
}

export interface VoicePipelineCallbacks {
  onTranscript: (text: string) => void;
  onResponseChunk: (text: string) => void;
  onAudio: (playable: AudioPlayable) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export class VoicePipeline {
  private stt: STTPipeline | null;
  private llm: LLMPipeline;
  private tts: TTSPipeline | null;
  private systemPrompt: string;
  private textNormalizer = new TextNormalizer();
  private history: Message[] = [];

  constructor(config: VoicePipelineConfig) {
    this.stt = config.stt ?? null;
    this.llm = config.llm;
    this.tts = config.tts ?? null;
    this.systemPrompt = config.systemPrompt;
    this.history = [{ role: 'system', content: this.systemPrompt }];
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    const promises: Promise<void>[] = [this.llm.initialize(onProgress)];

    if (this.stt) {
      promises.push(this.stt.initialize(onProgress));
    }
    if (this.tts) {
      promises.push(this.tts.initialize(onProgress));
    }

    await Promise.all(promises);
  }

  isReady(): boolean {
    const sttReady = this.stt ? this.stt.isReady() : true;
    const ttsReady = this.tts ? this.tts.isReady() : true;
    return sttReady && this.llm.isReady() && ttsReady;
  }

  /**
   * Check if pipeline has STT configured
   */
  hasSTT(): boolean {
    return this.stt !== null;
  }

  /**
   * Check if pipeline has TTS configured
   */
  hasTTS(): boolean {
    return this.tts !== null;
  }

  /**
   * Process audio input (requires STT backend)
   */
  async processAudio(audio: Float32Array, callbacks: VoicePipelineCallbacks): Promise<void> {
    if (!this.stt) {
      callbacks.onError(new Error('No STT backend configured. Use processText() instead.'));
      return;
    }

    try {
      // 1. STT
      const transcript = await this.stt.transcribe(audio);
      if (!transcript.trim()) {
        callbacks.onError(new Error('Could not transcribe audio'));
        return;
      }
      callbacks.onTranscript(transcript);

      // 2. Process the transcript
      await this.processTranscript(transcript, callbacks);

      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Process text input (for when client does local STT)
   */
  async processText(text: string, callbacks: Omit<VoicePipelineCallbacks, 'onTranscript'>): Promise<void> {
    try {
      await this.processTranscript(text, {
        ...callbacks,
        onTranscript: () => {}, // No-op since client already has transcript
      });
      callbacks.onComplete();
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Internal: Process a transcript through LLM and optionally TTS
   */
  private async processTranscript(transcript: string, callbacks: VoicePipelineCallbacks): Promise<void> {
    // Add to history
    this.history.push({ role: 'user', content: transcript });

    // LLM with optional streaming TTS
    await this.generateResponse(callbacks);
  }

  private async generateResponse(callbacks: VoicePipelineCallbacks): Promise<void> {
    // If no TTS, just stream text
    if (!this.tts) {
      const fullResponse = await this.llm.generate(this.history, (token) => {
        callbacks.onResponseChunk(token);
      });
      this.history.push({ role: 'assistant', content: fullResponse });
      return;
    }

    // With TTS: stream text and synthesize audio sentence by sentence
    let sentenceBuffer = '';
    const sentenceEnders = /[.!?]/;

    const playableQueue = new Map<number, AudioPlayable>();
    let nextSentenceIndex = 0;
    let nextToSend = 0;
    const ttsPromises: Promise<void>[] = [];

    const flushPlayableQueue = () => {
      while (playableQueue.has(nextToSend)) {
        const playable = playableQueue.get(nextToSend)!;
        callbacks.onAudio(playable);
        playableQueue.delete(nextToSend);
        nextToSend++;
      }
    };

    const queueTTS = (sentence: string, index: number) => {
      const normalizedText = this.textNormalizer.normalize(sentence);
      const promise = this.tts!
        .synthesize(normalizedText)
        .then((playable) => {
          playableQueue.set(index, playable);
          flushPlayableQueue();
        })
        .catch(() => {
          nextToSend = Math.max(nextToSend, index + 1);
          flushPlayableQueue();
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
