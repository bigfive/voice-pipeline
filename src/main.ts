/**
 * Voice Assistant - Main Entry Point
 * Push-to-talk interface with server-side STT/LLM/TTS
 */

import { VoiceClient, CONFIG } from "./voice-client";

// DOM Elements
const app = document.getElementById("app")!;

// Create UI
app.innerHTML = `
  <div class="container">
    <header>
      <h1>Voice Assistant</h1>
      <p class="subtitle">Push-to-talk • Server-side STT/TTS</p>
    </header>

    <div class="status-bar">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Connecting...</span>
    </div>

    <div class="conversation" id="conversation">
      <div class="message system">
        <p>Press and hold the button to speak</p>
      </div>
    </div>

    <div class="controls">
      <button id="pttButton" class="ptt-button" disabled>
        <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <span class="button-text">Hold to Speak</span>
      </button>

      <button id="clearButton" class="clear-button">Clear History</button>
    </div>

    <footer>
      <p>Server: <code>${CONFIG.serverUrl}</code></p>
    </footer>
  </div>
`;

// State
type State = "connecting" | "idle" | "listening" | "processing" | "speaking";
let currentState: State = "connecting";

// UI Elements
const statusDot = document.getElementById("statusDot")!;
const statusText = document.getElementById("statusText")!;
const conversation = document.getElementById("conversation")!;
const pttButton = document.getElementById("pttButton") as HTMLButtonElement;
const clearButton = document.getElementById("clearButton") as HTMLButtonElement;

// Update UI state
function setState(state: State) {
  currentState = state;
  statusDot.className = `status-dot ${state}`;

  const stateLabels: Record<State, string> = {
    connecting: "Connecting...",
    idle: "Ready",
    listening: "Listening...",
    processing: "Processing...",
    speaking: "Speaking...",
  };

  statusText.textContent = stateLabels[state];
  pttButton.disabled = state === "connecting" || state === "processing" || state === "speaking";

  if (state === "listening") {
    pttButton.classList.add("active");
  } else {
    pttButton.classList.remove("active");
  }
}

// Add message to conversation
function addMessage(role: "user" | "assistant", text: string): HTMLElement {
  const msg = document.createElement("div");
  msg.className = `message ${role}`;
  msg.innerHTML = `<p>${text}</p>`;
  conversation.appendChild(msg);
  conversation.scrollTop = conversation.scrollHeight;
  return msg;
}

// Update last assistant message (for streaming)
let currentAssistantMsg: HTMLElement | null = null;
let currentAssistantText = "";

function startAssistantMessage() {
  currentAssistantText = "";
  currentAssistantMsg = addMessage("assistant", "...");
}

function appendToAssistantMessage(chunk: string) {
  currentAssistantText += chunk;
  if (currentAssistantMsg) {
    currentAssistantMsg.innerHTML = `<p>${currentAssistantText}</p>`;
    conversation.scrollTop = conversation.scrollHeight;
  }
}

// Initialize client
const client = new VoiceClient({
  onConnected: () => {
    console.log("Connected to server");
    setState("idle");
  },
  onDisconnected: () => {
    console.log("Disconnected from server");
    setState("connecting");
    // Try to reconnect
    setTimeout(() => client.connect(), 2000);
  },
  onListening: () => {
    setState("listening");
  },
  onProcessing: () => {
    setState("processing");
  },
  onTranscript: (text) => {
    if (text) {
      addMessage("user", text);
      startAssistantMessage();
    }
  },
  onResponseChunk: (chunk) => {
    appendToAssistantMessage(chunk);
  },
  onResponse: (_text) => {
    currentAssistantMsg = null;
  },
  onSpeaking: () => {
    setState("speaking");
  },
  onIdle: () => {
    setState("idle");
  },
  onError: (error) => {
    console.error("Error:", error);
    setState("idle");
  },
});

// Connect to server
client.connect().catch((err) => {
  console.error("Failed to connect:", err);
  statusText.textContent = "Connection failed - retrying...";
  setTimeout(() => client.connect(), 2000);
});

// Push-to-talk handlers
pttButton.addEventListener("mousedown", async () => {
  if (currentState !== "idle") return;
  try {
    await client.startListening();
  } catch (err) {
    console.error("Failed to start listening:", err);
  }
});

pttButton.addEventListener("mouseup", async () => {
  if (!client.isRecording()) return;
  try {
    await client.stopAndRespond();
  } catch (err) {
    console.error("Failed to process:", err);
  }
});

pttButton.addEventListener("mouseleave", async () => {
  if (!client.isRecording()) return;
  try {
    await client.stopAndRespond();
  } catch (err) {
    console.error("Failed to process:", err);
  }
});

// Touch support for mobile
pttButton.addEventListener("touchstart", async (e) => {
  e.preventDefault();
  if (currentState !== "idle") return;
  try {
    await client.startListening();
  } catch (err) {
    console.error("Failed to start listening:", err);
  }
});

pttButton.addEventListener("touchend", async (e) => {
  e.preventDefault();
  if (!client.isRecording()) return;
  try {
    await client.stopAndRespond();
  } catch (err) {
    console.error("Failed to process:", err);
  }
});

// Clear history
clearButton.addEventListener("click", () => {
  client.clearHistory();
  conversation.innerHTML = `
    <div class="message system">
      <p>Conversation cleared. Press and hold to speak.</p>
    </div>
  `;
});

// Keyboard shortcut: Space to talk
document.addEventListener("keydown", async (e) => {
  if (e.code === "Space" && !e.repeat && currentState === "idle") {
    e.preventDefault();
    try {
      await client.startListening();
    } catch (err) {
      console.error("Failed to start listening:", err);
    }
  }
});

document.addEventListener("keyup", async (e) => {
  if (e.code === "Space" && client.isRecording()) {
    e.preventDefault();
    try {
      await client.stopAndRespond();
    } catch (err) {
      console.error("Failed to process:", err);
    }
  }
});
