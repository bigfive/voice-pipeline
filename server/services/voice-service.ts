/**
 * Voice Service
 * Orchestrates the STT → LLM → TTS pipeline flow
 */

import type { STTPipeline, LLMPipeline, TTSPipeline } from '../pipelines/types';
import type { ConversationService } from './conversation-service';
import type { TextNormalizer } from './text-normalizer';
import type { AudioResult } from '../../shared/types';

export interface VoiceProcessingCallbacks {
  onTranscript: (text: string) => void;
  onResponseChunk: (text: string) => void;
  onResponseComplete: (fullText: string) => void;
  onAudio: (audio: AudioResult, index: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export class VoiceService {
  constructor(
    private stt: STTPipeline,
    private llm: LLMPipeline,
    private tts: TTSPipeline,
    private textNormalizer: TextNormalizer,
    private conversationService: ConversationService
  ) {}

  /** Check if all pipelines are ready */
  isReady(): boolean {
    return this.stt.isReady() && this.llm.isReady() && this.tts.isReady();
  }

  /** Process audio input through the full pipeline */
  async processAudio(
    conversationId: string,
    audio: Float32Array,
    callbacks: VoiceProcessingCallbacks
  ): Promise<void> {
    try {
      // 1. Transcribe audio to text
      console.log('Transcribing...');
      const transcript = await this.stt.transcribe(audio);
      console.log(`Transcript: "${transcript}"`);

      callbacks.onTranscript(transcript);

      if (!transcript.trim()) {
        callbacks.onError(new Error('Could not transcribe audio'));
        return;
      }

      // 2. Add user message to conversation
      this.conversationService.addUserMessage(conversationId, transcript);
      const messages = this.conversationService.getMessages(conversationId);

      // 3. Generate LLM response with streaming TTS
      console.log('Generating response...');
      await this.generateWithStreamingTTS(
        conversationId,
        messages,
        callbacks
      );

      callbacks.onComplete();
    } catch (error) {
      console.error('Voice processing error:', error);
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Generate response and stream TTS for each sentence */
  private async generateWithStreamingTTS(
    conversationId: string,
    messages: { role: string; content: string }[],
    callbacks: VoiceProcessingCallbacks
  ): Promise<void> {
    let sentenceBuffer = '';
    const sentenceEnders = /[.!?]/;

    // Audio queue for ordered delivery
    const audioQueue = new Map<number, AudioResult>();
    let nextSentenceIndex = 0;
    let nextToSend = 0;
    const ttsPromises: Promise<void>[] = [];

    const flushAudioQueue = () => {
      while (audioQueue.has(nextToSend)) {
        const result = audioQueue.get(nextToSend)!;
        callbacks.onAudio(result, nextToSend);
        audioQueue.delete(nextToSend);
        nextToSend++;
      }
    };

    const queueTTS = (sentence: string, index: number) => {
      const normalizedText = this.textNormalizer.normalize(sentence);
      console.log(`TTS [${index}]: "${sentence}" -> "${normalizedText}"`);

      const promise = this.tts
        .synthesize(normalizedText)
        .then((result) => {
          audioQueue.set(index, result);
          flushAudioQueue();
        })
        .catch((err) => {
          console.error(`TTS error [${index}]:`, err);
          // Skip this index on error so queue doesn't stall
          nextToSend = Math.max(nextToSend, index + 1);
          flushAudioQueue();
        });

      ttsPromises.push(promise);
    };

    // Generate LLM response
    const fullResponse = await this.llm.generate(
      messages as { role: 'system' | 'user' | 'assistant'; content: string }[],
      (token) => {
        sentenceBuffer += token;
        callbacks.onResponseChunk(token);

        // Check for sentence boundaries for TTS
        const match = sentenceBuffer.match(sentenceEnders);
        if (match && match.index !== undefined) {
          const sentence = sentenceBuffer.slice(0, match.index + 1).trim();
          sentenceBuffer = sentenceBuffer.slice(match.index + 1);
          if (sentence) {
            queueTTS(sentence, nextSentenceIndex++);
          }
        }
      }
    );

    // Handle any remaining text
    if (sentenceBuffer.trim()) {
      queueTTS(sentenceBuffer.trim(), nextSentenceIndex++);
    }

    // Wait for all TTS to complete
    await Promise.all(ttsPromises);

    // Add assistant message to conversation history
    this.conversationService.addAssistantMessage(conversationId, fullResponse);
    callbacks.onResponseComplete(fullResponse);
  }
}

