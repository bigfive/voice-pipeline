/**
 * Local Transformers.js Example
 *
 * Everything runs in the browser - no server needed!
 * - STT: Whisper (Transformers.js via WebGPU)
 * - LLM: SmolLM (Transformers.js via WebGPU)
 * - TTS: WebSpeech API (browser native)
 *
 * Higher quality STT than WebSpeech, but requires model download.
 * Works in all browsers with WebGPU support (Chrome, Edge, Safari, Brave, Firefox 133+).
 */

import { VoiceClient, createVoiceClient, WebSpeechTTS } from 'voice-pipeline/client';
import { WhisperSTT, SmolLM } from 'voice-pipeline';

// ============ Browser Support Check ============

const support = VoiceClient.getBrowserSupport();

if (!support.webGPU) {
  document.body.innerHTML = `
    <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui; text-align: center;">
      <h1>⚠️ WebGPU Not Available</h1>
      <p>This example requires WebGPU for ML model inference.</p>
      <p style="color: #666;">
        WebGPU is supported in <strong>Chrome 113+</strong>, <strong>Edge 113+</strong>,
        <strong>Safari 17+</strong>, and <strong>Firefox 133+</strong>.
      </p>
      <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
        <p><strong>Try one of these alternatives:</strong></p>
        <ul style="text-align: left; display: inline-block;">
          <li><a href="../transformers-transformers-transformers/">transformers-transformers-transformers</a> - Server-side processing</li>
          <li><a href="../native-native-native/">native-native-native</a> - Native server backends</li>
        </ul>
      </div>
    </div>
  `;
  throw new Error('WebGPU not supported');
}

if (!support.webSpeechTTS) {
  console.warn('WebSpeech TTS not available - audio output will be disabled');
}

// ============ Config ============

const client = createVoiceClient({
  // All components are local - no server needed!
  stt: new WhisperSTT({
    model: 'Xenova/whisper-tiny.en',
    dtype: 'q8',
  }),
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
    initializing: 'Loading models...',
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

console.log('Mode:', client.getMode());
console.log('Local components:', client.getLocalComponents());

client.connect(); // No server connection - just initializes local components
