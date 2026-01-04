/**
 * Voice Assistant - Main Entry Point
 * Orchestrates all services and UI
 */

import { config } from './config';
import { AudioRecorder, AudioPlayer, WebSocketClient, base64ToArrayBuffer } from './services';
import { AppStateManager, STATE_LABELS } from './state';
import { createLayout, getUIElements, createMessageElement, updateMessageText, scrollToBottom } from './ui';
import type { ServerMessage } from '../shared/protocol';

// Initialize layout
const app = document.getElementById('app')!;
app.innerHTML = createLayout({ serverUrl: config.serverUrl });

// Get UI elements
const ui = getUIElements();

// Initialize state manager
const stateManager = new AppStateManager();

// Initialize services
const audioRecorder = new AudioRecorder({ sampleRate: config.audio.sampleRate });
const audioPlayer = new AudioPlayer();
const wsClient = new WebSocketClient(
  { url: config.serverUrl, reconnectDelay: config.reconnectDelay },
  {
    onConnected: () => {
      console.log('Connected to server');
      stateManager.setState('idle');
    },
    onDisconnected: () => {
      console.log('Disconnected from server');
      stateManager.setState('connecting');
      // Reconnect after delay
      setTimeout(() => connectToServer(), config.reconnectDelay);
    },
    onMessage: handleServerMessage,
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  }
);

// State for streaming assistant response
let currentAssistantMsg: HTMLElement | null = null;
let currentAssistantText = '';

// ============ UI State Updates ============

stateManager.subscribe((state) => {
  // Update status indicator
  ui.statusDot.className = `status-dot ${state}`;
  ui.statusText.textContent = STATE_LABELS[state];

  // Update button state
  ui.pttButton.disabled = stateManager.isButtonDisabled();

  // Update button appearance
  if (state === 'listening') {
    ui.pttButton.classList.add('active');
  } else {
    ui.pttButton.classList.remove('active');
  }
});

// ============ Server Message Handling ============

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'transcript':
      handleTranscript(message.text);
      break;

    case 'response_text':
      if (message.text) {
        handleResponseChunk(message.text);
      }
      if (message.done) {
        handleResponseComplete();
      }
      break;

    case 'audio':
      handleAudio(message.data, message.sampleRate);
      break;

    case 'done':
      handleDone();
      break;

    case 'error':
      handleError(message.message);
      break;

    case 'history_cleared':
      console.log('Conversation history cleared');
      break;
  }
}

function handleTranscript(text: string): void {
  console.log('Transcript:', text);
  if (text) {
    addMessage('user', text);
    startAssistantMessage();
  }
}

function handleResponseChunk(chunk: string): void {
  currentAssistantText += chunk;
  if (currentAssistantMsg) {
    updateMessageText(currentAssistantMsg, currentAssistantText);
    scrollToBottom(ui.conversation);
  }
}

function handleResponseComplete(): void {
  currentAssistantMsg = null;
}

function handleAudio(data: string, sampleRate: number): void {
  stateManager.setState('speaking');
  const audioData = base64ToArrayBuffer(data);
  const float32 = new Float32Array(audioData);
  audioPlayer.enqueue(float32, sampleRate);
}

function handleDone(): void {
  // Wait for audio to finish before going idle
  audioPlayer.waitForComplete().then(() => {
    stateManager.setState('idle');
  });
}

function handleError(message: string): void {
  console.error('Server error:', message);
  stateManager.setState('idle');
}

// ============ Message Rendering ============

function addMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const msg = createMessageElement(role, text);
  ui.conversation.appendChild(msg);
  scrollToBottom(ui.conversation);
  return msg;
}

function startAssistantMessage(): void {
  currentAssistantText = '';
  currentAssistantMsg = addMessage('assistant', '...');
}

// ============ Connection ============

async function connectToServer(): Promise<void> {
  try {
    await wsClient.connect();
  } catch (err) {
    console.error('Failed to connect:', err);
    ui.statusText.textContent = 'Connection failed - retrying...';
    setTimeout(() => connectToServer(), config.reconnectDelay);
  }
}

// ============ Recording ============

async function startRecording(): Promise<void> {
  if (!stateManager.isIdle()) return;

  stateManager.setState('listening');

  await audioRecorder.start((chunk) => {
    wsClient.sendAudio(chunk.buffer as ArrayBuffer, config.audio.sampleRate);
  });
}

async function stopRecording(): Promise<void> {
  if (!audioRecorder.isRecording()) return;

  await audioRecorder.stop();
  stateManager.setState('processing');
  wsClient.sendEndAudio();
}

// ============ Event Handlers ============

// Push-to-talk: mouse
ui.pttButton.addEventListener('mousedown', async () => {
  await startRecording();
});

ui.pttButton.addEventListener('mouseup', async () => {
  await stopRecording();
});

ui.pttButton.addEventListener('mouseleave', async () => {
  if (audioRecorder.isRecording()) {
    await stopRecording();
  }
});

// Push-to-talk: touch (mobile)
ui.pttButton.addEventListener('touchstart', async (e) => {
  e.preventDefault();
  await startRecording();
});

ui.pttButton.addEventListener('touchend', async (e) => {
  e.preventDefault();
  await stopRecording();
});

// Clear history
ui.clearButton.addEventListener('click', () => {
  wsClient.sendClearHistory();
  ui.conversation.innerHTML = `
    <div class="message system">
      <p>Conversation cleared. Press and hold to speak.</p>
    </div>
  `;
});

// Keyboard shortcut: Space to talk
document.addEventListener('keydown', async (e) => {
  if (e.code === 'Space' && !e.repeat && stateManager.isIdle()) {
    e.preventDefault();
    await startRecording();
  }
});

document.addEventListener('keyup', async (e) => {
  if (e.code === 'Space' && audioRecorder.isRecording()) {
    e.preventDefault();
    await stopRecording();
  }
});

// ============ Initialize ============

connectToServer();
