/**
 * Hybrid Example - WebSpeech STT/TTS with Cloud LLM
 *
 * Best of both worlds:
 * - STT: WebSpeech API (browser native - instant, no download)
 * - LLM: Cloud API (server proxies to OpenAI/Ollama/vLLM)
 * - TTS: WebSpeech API (browser native - natural voices)
 *
 * This is great when you want cloud LLM power (GPT-4, Claude, etc.)
 * but don't want to transfer audio over the network.
 *
 * NOTE: WebSpeech STT only works in Chrome, Edge, and Safari.
 */

import { VoiceClient, createVoiceClient, WebSpeechSTT, WebSpeechTTS } from 'voice-pipeline/client';

// ============ Browser Support Check ============

const support = VoiceClient.getBrowserSupport();

if (!support.webSpeechSTT) {
  document.body.innerHTML = `
    <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui; text-align: center;">
      <h1>⚠️ Browser Not Supported</h1>
      <p>WebSpeech STT is not available in this browser.</p>
      <p style="color: #666;">
        This example uses the Web Speech API for voice recognition, which is only supported in
        <strong>Chrome</strong>, <strong>Edge</strong>, and <strong>Safari</strong>.
      </p>
      <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
        <p><strong>Try one of these alternatives:</strong></p>
        <ul style="text-align: left; display: inline-block;">
          <li><a href="../example-9-native-cloud-native/">native-cloud-native</a> - Server handles STT/TTS</li>
          <li><a href="../example-4-native-native-native/">native-native-native</a> - All native on server</li>
        </ul>
      </div>
    </div>
  `;
  throw new Error('WebSpeech STT not supported');
}

// ============ Config ============

const client = createVoiceClient({
  // Local STT - transcribed text sent to server
  stt: new WebSpeechSTT({ language: 'en-US' }),
  // Server LLM - proxies to cloud API
  llm: null,
  // Local TTS - speaks response text from server
  tts: new WebSpeechTTS({ voiceName: 'Samantha', rate: 1.1 }),
  serverUrl: 'ws://localhost:3105',
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
    ready: 'Ready (cloud mode)',
    listening: 'Listening...',
    processing: 'Cloud thinking...',
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

console.log('Mode:', client.getMode()); // 'hybrid'
console.log('Local components:', client.getLocalComponents()); // { stt: true, llm: false, tts: true }

client.connect();

