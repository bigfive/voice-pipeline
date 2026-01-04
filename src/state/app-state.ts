/**
 * Application State Management
 * Simple state machine for the voice assistant client
 */

import { STATE_LABELS, type AppState } from '../../shared/types';

export type StateChangeCallback = (state: AppState, previousState: AppState) => void;

export class AppStateManager {
  private state: AppState = 'connecting';
  private listeners: StateChangeCallback[] = [];

  /** Get current state */
  getState(): AppState {
    return this.state;
  }

  /** Transition to a new state */
  setState(newState: AppState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;

    // Notify all listeners
    for (const listener of this.listeners) {
      listener(newState, previousState);
    }
  }

  /** Subscribe to state changes */
  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /** Check if in a specific state */
  is(state: AppState): boolean {
    return this.state === state;
  }

  /** Check if button should be disabled */
  isButtonDisabled(): boolean {
    return (
      this.state === 'connecting' ||
      this.state === 'processing' ||
      this.state === 'speaking'
    );
  }

  /** Check if currently listening */
  isListening(): boolean {
    return this.state === 'listening';
  }

  /** Check if ready for interaction */
  isIdle(): boolean {
    return this.state === 'idle';
  }
}

/** State transition labels for display */
export { STATE_LABELS };
export type { AppState };

