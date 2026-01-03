// main.ts - App entry point
import { VoiceAssistant, CONFIG } from './voice-assistant';

// DOM Elements
const talkBtn = document.getElementById('talkBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;
const transcript = document.getElementById('transcript') as HTMLDivElement;
const initOverlay = document.getElementById('initOverlay') as HTMLDivElement;
const loadingStatus = document.getElementById('loadingStatus') as HTMLParagraphElement;
const progressFill = document.getElementById('progressFill') as HTMLDivElement;

// State
let assistant: VoiceAssistant;
let currentResponseDiv: HTMLDivElement | null = null;

// Helper to add messages to transcript
function addMessage(role: 'user' | 'assistant', text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="message-label">${role === 'user' ? 'You' : 'Assistant'}</div>
    <div class="message-content">${text}</div>
  `;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
}

// Initialize the assistant
async function init() {
  assistant = new VoiceAssistant({
    onInitProgress: (stage, progress) => {
      loadingStatus.textContent = stage;
      progressFill.style.width = `${progress}%`;
    },

    onReady: () => {
      initOverlay.classList.add('hidden');
      talkBtn.disabled = false;
      status.textContent = 'Press and hold to talk';
    },

    onListening: () => {
      talkBtn.classList.add('recording');
      talkBtn.classList.remove('processing', 'speaking');
      talkBtn.textContent = 'Listening...';
      status.textContent = 'Listening...';
    },

    onProcessing: () => {
      talkBtn.classList.remove('recording');
      talkBtn.classList.add('processing');
      talkBtn.textContent = 'Processing';
      status.innerHTML = '<span class="loading-dots">Transcribing</span>';
    },

    onTranscript: (text) => {
      if (text) {
        addMessage('user', text);
        status.innerHTML = '<span class="loading-dots">Thinking</span>';
      }
    },

    onResponseChunk: (chunk) => {
      // Create assistant message div on first chunk
      if (!currentResponseDiv) {
        currentResponseDiv = addMessage('assistant', '');
      }
      const content = currentResponseDiv.querySelector('.message-content');
      if (content) {
        content.textContent += chunk;
      }
      transcript.scrollTop = transcript.scrollHeight;
    },

    onSpeaking: () => {
      talkBtn.classList.remove('processing');
      talkBtn.classList.add('speaking');
      talkBtn.textContent = 'Speaking';
      status.innerHTML = '<span class="loading-dots">Speaking</span>';
    },

    onResponse: (_text) => {
      // Full response received
      currentResponseDiv = null;
    },

    onIdle: () => {
      talkBtn.classList.remove('recording', 'processing', 'speaking');
      talkBtn.textContent = 'Hold to Talk';
      status.textContent = 'Press and hold to talk';
      currentResponseDiv = null;
    },

    onError: (error) => {
      console.error('Assistant error:', error);

      if (initOverlay.classList.contains('hidden')) {
        // Runtime error
        addMessage('assistant', `⚠️ Error: ${error.message}`);
      } else {
        // Init error
        loadingStatus.textContent = `⚠️ ${error.message}`;
        progressFill.style.background = '#e94560';
      }
    },
  });

  try {
    await assistant.init();
  } catch (err) {
    console.error('Failed to initialize:', err);
  }
}

// Event handlers
async function handleStart() {
  if (!assistant?.isReady()) return;

  try {
    await assistant.startListening();
  } catch (err) {
    console.error('Failed to start listening:', err);
  }
}

async function handleStop() {
  if (!assistant?.isRecording()) return;

  try {
    await assistant.stopAndRespond();
  } catch (err) {
    console.error('Failed to process:', err);
  }
}

// Mouse events
talkBtn.addEventListener('mousedown', handleStart);
talkBtn.addEventListener('mouseup', handleStop);
talkBtn.addEventListener('mouseleave', () => {
  if (assistant?.isRecording()) handleStop();
});

// Touch events
talkBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handleStart();
});
talkBtn.addEventListener('touchend', (e) => {
  e.preventDefault();
  handleStop();
});

// Keyboard support (spacebar)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && document.activeElement !== talkBtn) {
    e.preventDefault();
    handleStart();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleStop();
  }
});

// Display config info
const subtitle = document.querySelector('.subtitle');
if (subtitle) {
  subtitle.textContent = `Moonshine STT • ${CONFIG.ollama.model} • Kitten TTS`;
}

// Start
init();

