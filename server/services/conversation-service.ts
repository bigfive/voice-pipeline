/**
 * Conversation Service
 * Manages conversation sessions and message history
 */

import type { Message, Conversation } from '../../shared/types';

export class ConversationService {
  private conversations = new Map<string, Conversation>();
  private systemPrompt: string;

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
  }

  /** Create a new conversation session */
  createConversation(id: string): Conversation {
    const now = Date.now();
    const conversation: Conversation = {
      id,
      messages: [
        {
          role: 'system',
          content: this.systemPrompt,
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(id, conversation);
    return conversation;
  }

  /** Get an existing conversation or create one if it doesn't exist */
  getOrCreateConversation(id: string): Conversation {
    const existing = this.conversations.get(id);
    if (existing) {
      return existing;
    }
    return this.createConversation(id);
  }

  /** Get a conversation by ID */
  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /** Add a user message to a conversation */
  addUserMessage(conversationId: string, content: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    conversation.updatedAt = Date.now();
  }

  /** Add an assistant message to a conversation */
  addAssistantMessage(conversationId: string, content: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push({
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
    conversation.updatedAt = Date.now();
  }

  /** Get the message history for LLM input */
  getMessages(conversationId: string): Message[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    return conversation.messages;
  }

  /** Clear a conversation's history (keep system prompt) */
  clearHistory(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return;
    }

    const now = Date.now();
    conversation.messages = [
      {
        role: 'system',
        content: this.systemPrompt,
        timestamp: now,
      },
    ];
    conversation.updatedAt = now;
  }

  /** Delete a conversation entirely */
  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  /** Get all active conversation IDs */
  getActiveConversationIds(): string[] {
    return Array.from(this.conversations.keys());
  }
}

