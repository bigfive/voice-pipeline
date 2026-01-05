/**
 * Fully Local Browser Example
 *
 * Everything runs in the browser - no server needed!
 * - STT: WebSpeech API (browser native)
 * - LLM: Transformers.js (SmolLM via WebGPU)
 * - TTS: WebSpeech API (browser native)
 *
 * This is the simplest setup - no models to download for STT/TTS.
 */

import { createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';
import { SmolLM } from 'voice-pipeline';

// ============ Config ============

const client = createVoiceClient({
  // All components are local - no server needed!
  stt: new WebSpeechSTT({ language: 'en-US' }),
  llm: new SmolLM({
    model: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    dtype: 'q4',
    maxNewTokens: 140,
    temperature: 0.7,
    device: 'webgpu',
  }),
  tts: new WebSpeechTTS({ voiceName: 'Samantha', rate: 1.1 }),
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
  // Note: no serverUrl needed!
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
    disconnected: 'Not initialized',
    initializing: 'Loading LLM model...',
    ready: 'Ready (fully local)',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Speaking...',
  };
  status.textContent = statusMap[newStatus] || newStatus;
  recordBtn.disabled = !['ready', 'speaking'].includes(newStatus);

  if (newStatus === 'listening') {
    recordBtn.textContent = '⏹️ Stop';
    recordBtn.classList.add('recording');
  } else {
    recordBtn.textContent = '🎤 Hold to Speak';
    recordBtn.classList.remove('recording');
  }
});

client.on('progress', ({ status: progressStatus, file, progress }) => {
  if (progressStatus === 'progress' && progress) {
    status.textContent = `Loading: ${file?.split('/').pop() || 'model'} ${Math.round(progress)}%`;
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

// ============ Initialize ============

// Show mode info
console.log('Mode:', client.getMode());
console.log('Local components:', client.getLocalComponents());

client.connect(); // No server connection - just initializes local components

