/**
 * Local Transformers.js Example
 * STT & LLM run in browser via WebGPU, TTS uses Web Speech API
 */

import {
  VoicePipeline,
  WhisperSTTPipeline,
  SmolLMPipeline,
  WebSpeechTTSPipeline,
} from '../../lib';

// ============ Config ============

const CONFIG = {
  stt: { model: 'Xenova/whisper-tiny.en', dtype: 'q8' },
  llm: { model: 'HuggingFaceTB/SmolLM2-360M-Instruct', dtype: 'q4', maxNewTokens: 140, temperature: 0.7, device: 'webgpu' as const },
  tts: { voiceName: 'Martha', rate: 1.1, pitch: 0.6 },
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief—1-2 sentences. Speak naturally.',
};

// ============ State ============

let pipeline: VoicePipeline;
let tts: WebSpeechTTSPipeline;
let audioContext: AudioContext;
let isRecording = false;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

// ============ UI Elements ============

const status = document.getElementById('status')!;
const conversation = document.getElementById('conversation')!;
const recordBtn = document.getElementById('recordBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// ============ Audio Helpers ============

async function blobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  audioContext = audioContext || new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.getChannelData(0);
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

// ============ Recording ============

async function startRecording(): Promise<void> {
  if (isRecording) return;
  isRecording = true;
  audioChunks = [];
  recordBtn.textContent = '⏹️ Stop';
  recordBtn.classList.add('recording');
  setStatus('Listening...');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    await processAudio();
  };
  mediaRecorder.start();
}

async function stopRecording(): Promise<void> {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  recordBtn.textContent = '🎤 Hold to Speak';
  recordBtn.classList.remove('recording');
  mediaRecorder.stop();
}

// ============ Processing ============

async function processAudio(): Promise<void> {
  setStatus('Processing...');
  recordBtn.disabled = true;

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const audio = await blobToFloat32(blob);

  let assistantEl: HTMLElement | null = null;
  let assistantText = '';

  await pipeline.processAudio(audio, {
    onTranscript: (text) => {
      addMessage('user', text);
      assistantEl = addMessage('assistant', '...');
    },
    onResponseChunk: (chunk) => {
      assistantText += chunk;
      if (assistantEl) updateMessage(assistantEl, assistantText);
    },
    onAudio: () => {
      // Web Speech TTS doesn't return audio data, we'll speak after completion
    },
    onComplete: async () => {
      // Use Web Speech API to speak the response
      if (assistantText) {
        setStatus('Speaking...');
        await tts.speak(assistantText);
      }
      setStatus('Ready');
      recordBtn.disabled = false;
    },
    onError: (err) => {
      console.error(err);
      setStatus('Error: ' + err.message);
      recordBtn.disabled = false;
    },
  });
}

// ============ Initialize ============

async function init(): Promise<void> {
  setStatus('Loading models (this may take a minute)...');
  recordBtn.disabled = true;

  const stt = new WhisperSTTPipeline(CONFIG.stt);
  const llm = new SmolLMPipeline(CONFIG.llm);
  tts = new WebSpeechTTSPipeline(CONFIG.tts);

  pipeline = new VoicePipeline({ stt, llm, tts, systemPrompt: CONFIG.systemPrompt });

  await pipeline.initialize((progress) => {
    if (progress.status === 'progress' && progress.progress) {
      setStatus(`Loading: ${progress.file?.split('/').pop() || 'model'} ${Math.round(progress.progress)}%`);
    }
  });

  setStatus('Ready');
  recordBtn.disabled = false;
}

// ============ Event Handlers ============

recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('mouseleave', () => isRecording && stopRecording());
recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

clearBtn.addEventListener('click', () => {
  pipeline.clearHistory();
  conversation.innerHTML = '<div class="message system">Conversation cleared.</div>';
});

document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !recordBtn.disabled) { e.preventDefault(); startRecording(); } });
document.addEventListener('keyup', (e) => { if (e.code === 'Space') { e.preventDefault(); stopRecording(); } });

init();

