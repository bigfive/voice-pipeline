/**
 * Browser Client for Native STT/TTS + Cloud LLM Example
 *
 * Fully remote mode - server handles everything:
 * - STT: whisper.cpp (server)
 * - LLM: Cloud API (OpenAI/Ollama via server)
 * - TTS: sherpa-onnx (server)
 *
 * Client only sends/receives audio.
 */

import { createVoiceClient } from 'voice-pipeline/client';

// ============ Config ============

const client = createVoiceClient({
  // All null = server handles everything
  stt: null,
  llm: null,
  tts: null,
  serverUrl: 'ws://localhost:3106',
});

// ============ UI Elements ============

const status = document.getElementById('status')!;
const conversation = document.getElementById('conversation')!;
const recordBtn = document.getElementById('recordBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// ============ UI Helpers ============

let currentAssistantEl: HTMLElement | null = null;
let currentAssistantText = '';

function addMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<strong>${role === 'user' ? 'You' : 'Assistant'}:</strong> <span>${text}</span>`;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
  return div;
}

function updateMessage(el: HTMLElement, text: string): void {
  el.querySelector('span')!.textContent = text;
  conversation.scrollTop = conversation.scrollHeight;
}

// ============ Event Handlers ============

client.on('status', (newStatus) => {
  const statusMap: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    ready: 'Ready (native + cloud)',
    listening: 'Listening...',
    processing: 'Processing...',
    speaking: 'Speaking...',
  };
  status.textContent = statusMap[newStatus] || newStatus;
  recordBtn.disabled = newStatus === 'disconnected' || newStatus === 'connecting' || newStatus === 'processing';

  if (newStatus === 'listening') {
    recordBtn.textContent = '⏹️ Stop';
    recordBtn.classList.add('recording');
  } else {
    recordBtn.textContent = '🎤 Hold to Speak';
    recordBtn.classList.remove('recording');
  }
});

client.on('transcript', (text) => {
  addMessage('user', text);
  currentAssistantEl = addMessage('assistant', '...');
  currentAssistantText = '';
});

client.on('responseChunk', (chunk) => {
  currentAssistantText += chunk;
  if (currentAssistantEl) {
    updateMessage(currentAssistantEl, currentAssistantText);
  }
});

client.on('responseComplete', () => {
  currentAssistantEl = null;
});

client.on('error', (err) => {
  console.error('Voice client error:', err);
  status.textContent = 'Error: ' + err.message;
});

// ============ Button Controls ============

recordBtn.addEventListener('mousedown', () => client.startRecording());
recordBtn.addEventListener('mouseup', () => client.stopRecording());
recordBtn.addEventListener('mouseleave', () => client.isRecording() && client.stopRecording());
recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); client.startRecording(); });
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); client.stopRecording(); });

clearBtn.addEventListener('click', () => {
  client.clearHistory();
  conversation.innerHTML = '<div class="message system">Conversation cleared.</div>';
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !recordBtn.disabled) {
    e.preventDefault();
    client.startRecording();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    client.stopRecording();
  }
});

// ============ Connect ============

console.log('Mode:', client.getMode());
console.log('Local components:', client.getLocalComponents());

client.connect();

