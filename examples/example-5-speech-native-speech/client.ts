/**
 * Hybrid Example - WebSpeech STT/TTS with Server LLM + Tools
 *
 * Best of both worlds:
 * - STT: WebSpeech API (browser native - instant, no download)
 * - LLM: Native llama.cpp (server) with tool calling
 * - TTS: WebSpeech API (browser native - natural voices)
 *
 * Demonstrates tool/function calling with native LLM - try asking:
 * - "What time is it?"
 * - "What's the weather in Paris?"
 * - "Roll 2d6 for me"
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
          <li><a href="../native-native-native/">native-native-native</a> - Server handles everything</li>
          <li><a href="../transformers-transformers-speech/">transformers-transformers-speech</a> - Server STT/LLM, local TTS</li>
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
  // Server LLM - just processes text
  llm: null,
  // Local TTS - speaks response text from server
  tts: new WebSpeechTTS({ voiceName: 'Samantha', rate: 1.1 }),
  serverUrl: 'ws://localhost:3104',
});

// ============ UI Elements ============

const status = document.getElementById('status')!;
const conversation = document.getElementById('conversation')!;
const recordBtn = document.getElementById('recordBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// ============ UI Helpers ============

let currentAssistantEl: HTMLElement | null = null;
let currentAssistantText = '';
let currentToolDetailsEl: HTMLElement | null = null;

function addMessage(role: 'user' | 'assistant', text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<strong>${role === 'user' ? 'You' : 'Assistant'}:</strong> <span class="text">${text}</span>`;
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
  return div;
}

function updateMessage(el: HTMLElement, text: string): void {
  el.querySelector('.text')!.textContent = text;
  conversation.scrollTop = conversation.scrollHeight;
}

function addToolDetails(el: HTMLElement): HTMLElement {
  // Create or get the tool details container within the assistant message
  let details = el.querySelector('.tool-details') as HTMLElement;
  if (!details) {
    details = document.createElement('div');
    details.className = 'tool-details';
    el.appendChild(details);
  }
  return details;
}

function addToolCall(el: HTMLElement, toolName: string, args: Record<string, unknown>): HTMLElement {
  const details = addToolDetails(el);
  const toolDiv = document.createElement('div');
  toolDiv.className = 'tool-item';
  toolDiv.innerHTML = `<span class="tool-icon">🔧</span> <span class="tool-label">Using:</span> <span class="tool-name">${toolName}</span>`;
  if (Object.keys(args).length > 0) {
    toolDiv.innerHTML += `<code class="tool-args">${JSON.stringify(args)}</code>`;
  }
  details.appendChild(toolDiv);
  conversation.scrollTop = conversation.scrollHeight;
  return toolDiv;
}

function addToolResult(el: HTMLElement, result: unknown): void {
  const details = addToolDetails(el);
  const resultDiv = document.createElement('div');
  resultDiv.className = 'tool-item tool-result';
  resultDiv.innerHTML = `<span class="tool-icon">✓</span> <span class="tool-label">Result:</span> <code class="tool-result-code">${JSON.stringify(result)}</code>`;
  details.appendChild(resultDiv);
  conversation.scrollTop = conversation.scrollHeight;
}

// ============ Event Handlers ============

client.on('status', (newStatus) => {
  const statusMap: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    ready: 'Ready (hybrid mode)',
    listening: 'Listening...',
    processing: 'Server thinking...',
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

// Tool call events - show as grouped details within the assistant message
client.on('toolCall', (toolCall) => {
  if (currentAssistantEl) {
    addToolCall(currentAssistantEl, toolCall.name, toolCall.arguments);
  }
});

client.on('toolResult', (_toolCallId, result) => {
  if (currentAssistantEl) {
    addToolResult(currentAssistantEl, result);
  }
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

