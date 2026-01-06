/**
 * Client for Mixed Server Example
 *
 * Server uses native whisper.cpp + Transformers.js LLM
 * Client handles TTS with WebSpeech
 *
 * - STT: Native whisper.cpp (server)
 * - LLM: Transformers.js TransformersLLM (server)
 * - TTS: WebSpeech API (browser)
 */

import { createVoiceClient, WebSpeechTTS } from 'voice-pipeline/client';

// ============ Config ============

const client = createVoiceClient({
  // Server handles STT (native whisper.cpp)
  stt: null,
  // Server handles LLM (Transformers.js)
  llm: null,
  // Local TTS - browser WebSpeech
  tts: new WebSpeechTTS({ voiceName: 'Samantha', rate: 1.1 }),
  serverUrl: 'ws://localhost:3102', // Points to mixed server
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
    ready: 'Ready (native STT + TF LLM + browser TTS)',
    listening: 'Listening...',
    processing: 'Server processing...',
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

