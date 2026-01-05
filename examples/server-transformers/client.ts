/**
 * Browser Client for Server-Transformers Example
 */

import type { ClientMessage, ServerMessage } from './protocol';

const SERVER_URL = 'ws://localhost:8080';
const SAMPLE_RATE = 16000;

// ============ State ============

let ws: WebSocket | null = null;
let audioContext: AudioContext;
let isRecording = false;
let mediaRecorder: MediaRecorder | null = null;
let audioWorklet: AudioWorkletNode | null = null;

// ============ UI Elements ============

const status = document.getElementById('status')!;
const conversation = document.getElementById('conversation')!;
const recordBtn = document.getElementById('recordBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// ============ WebSocket ============

function connect(): void {
  setStatus('Connecting...');
  ws = new WebSocket(SERVER_URL);

  ws.onopen = () => {
    setStatus('Ready');
    recordBtn.disabled = false;
  };

  ws.onclose = () => {
    setStatus('Disconnected');
    recordBtn.disabled = true;
    setTimeout(connect, 2000);
  };

  ws.onmessage = (event) => handleMessage(JSON.parse(event.data));
  ws.onerror = (err) => console.error('WebSocket error:', err);
}

function send(msg: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ============ Message Handling ============

let currentAssistantEl: HTMLElement | null = null;
let currentAssistantText = '';
const audioQueue: Array<{ audio: Float32Array; sampleRate: number }> = [];
let isPlaying = false;

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'transcript':
      addMessage('user', msg.text);
      currentAssistantEl = addMessage('assistant', '...');
      currentAssistantText = '';
      break;

    case 'response_chunk':
      currentAssistantText += msg.text;
      if (currentAssistantEl) updateMessage(currentAssistantEl, currentAssistantText);
      break;

    case 'audio':
      const buffer = base64ToFloat32(msg.data);
      audioQueue.push({ audio: buffer, sampleRate: msg.sampleRate });
      playNext();
      break;

    case 'complete':
      currentAssistantEl = null;
      break;

    case 'error':
      console.error('Server error:', msg.message);
      setStatus('Error: ' + msg.message);
      recordBtn.disabled = false;
      break;
  }
}

// ============ Audio Playback ============

function base64ToFloat32(data: string): Float32Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

async function playNext(): Promise<void> {
  if (isPlaying || audioQueue.length === 0) return;
  isPlaying = true;
  setStatus('Speaking...');

  const { audio, sampleRate } = audioQueue.shift()!;
  audioContext = audioContext || new AudioContext();
  const buffer = audioContext.createBuffer(1, audio.length, sampleRate);
  buffer.getChannelData(0).set(audio);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => {
    isPlaying = false;
    if (audioQueue.length > 0) {
      playNext();
    } else {
      setStatus('Ready');
    }
  };
  source.start();
}

// ============ Recording ============

async function startRecording(): Promise<void> {
  if (isRecording) return;
  isRecording = true;
  recordBtn.textContent = '⏹️ Stop';
  recordBtn.classList.add('recording');
  setStatus('Listening...');

  audioContext = audioContext || new AudioContext({ sampleRate: SAMPLE_RATE });

  // Add worklet for PCM conversion
  await audioContext.audioWorklet.addModule(
    URL.createObjectURL(new Blob([`
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0][0];
          if (input) {
            const int16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
              int16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
            }
            this.port.postMessage(int16);
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `], { type: 'application/javascript' }))
  );

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: SAMPLE_RATE, channelCount: 1 } });
  const source = audioContext.createMediaStreamSource(stream);
  audioWorklet = new AudioWorkletNode(audioContext, 'pcm-processor');

  audioWorklet.port.onmessage = (e) => {
    const float32 = new Float32Array(e.data.length);
    for (let i = 0; i < e.data.length; i++) float32[i] = e.data[i] / 32768.0;
    send({ type: 'audio', data: float32ToBase64(float32), sampleRate: SAMPLE_RATE });
  };

  source.connect(audioWorklet);
  mediaRecorder = { stream } as any; // Store stream for cleanup
}

function float32ToBase64(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function stopRecording(): Promise<void> {
  if (!isRecording) return;
  isRecording = false;
  recordBtn.textContent = '🎤 Hold to Speak';
  recordBtn.classList.remove('recording');
  setStatus('Processing...');
  recordBtn.disabled = true;

  if (mediaRecorder) {
    (mediaRecorder as any).stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    mediaRecorder = null;
  }
  if (audioWorklet) {
    audioWorklet.disconnect();
    audioWorklet = null;
  }

  send({ type: 'end_audio' });

  // Re-enable after processing
  setTimeout(() => { recordBtn.disabled = false; }, 500);
}

// ============ UI Helpers ============

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

function setStatus(text: string): void {
  status.textContent = text;
}

// ============ Event Handlers ============

recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('mouseleave', () => isRecording && stopRecording());
recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

clearBtn.addEventListener('click', () => {
  send({ type: 'clear_history' });
  conversation.innerHTML = '<div class="message system">Conversation cleared.</div>';
});

document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !recordBtn.disabled) { e.preventDefault(); startRecording(); } });
document.addEventListener('keyup', (e) => { if (e.code === 'Space') { e.preventDefault(); stopRecording(); } });

// ============ Initialize ============

connect();

