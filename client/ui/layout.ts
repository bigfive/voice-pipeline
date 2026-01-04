/**
 * Application Layout
 * Main HTML structure for the voice assistant
 */

import { MIC_ICON } from './components';

export interface LayoutConfig {
  serverUrl: string;
}

/** Generate the main application HTML */
export function createLayout(config: LayoutConfig): string {
  return `
    <div class="container">
      <header>
        <h1>Voice Assistant</h1>
        <p class="subtitle">Push-to-talk • Server-side STT/TTS</p>
      </header>

      <div class="status-bar">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Connecting...</span>
      </div>

      <div class="conversation" id="conversation">
        <div class="message system">
          <p>Press and hold the button to speak</p>
        </div>
      </div>

      <div class="controls">
        <button id="pttButton" class="ptt-button" disabled>
          ${MIC_ICON}
          <span class="button-text">Hold to Speak</span>
        </button>

        <button id="clearButton" class="clear-button">Clear History</button>
      </div>

      <footer>
        <p>Server: <code>${config.serverUrl}</code></p>
      </footer>
    </div>
  `;
}

/** Get UI elements after layout is rendered */
export interface UIElements {
  statusDot: HTMLElement;
  statusText: HTMLElement;
  conversation: HTMLElement;
  pttButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
}

export function getUIElements(): UIElements {
  return {
    statusDot: document.getElementById('statusDot')!,
    statusText: document.getElementById('statusText')!,
    conversation: document.getElementById('conversation')!,
    pttButton: document.getElementById('pttButton') as HTMLButtonElement,
    clearButton: document.getElementById('clearButton') as HTMLButtonElement,
  };
}

