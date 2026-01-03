"""
Voice Assistant Server
Streams audio in via WebSocket, processes STT -> LLM -> TTS, streams audio back
"""

import asyncio
import io
import json
import wave
import struct
from typing import AsyncGenerator

import httpx
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from piper import PiperVoice

# ============ CONFIG ============
CONFIG = {
    "ollama": {
        "base_url": "http://localhost:11434",
        "model": "gemma3n:e2b",
        "system_prompt": (
            "You are a helpful voice assistant. Keep your responses very brief and concise—ideally 1 sentence. "
            "Speak naturally as if having a conversation. Avoid lists, markdown, or lengthy explanations unless explicitly asked. "
            "The user sometimes makes typos or autocorrects the wrong thing. Make assumptions about what they may have meant and respond as if they said that."
        ),
    },
    "stt": {
        "model_size": "base.en",  # tiny.en, base.en, small.en, medium.en, large-v3
        "device": "auto",  # cpu, cuda, auto
        "compute_type": "auto",  # float16, int8, auto
    },
    "tts": {
        "model": "en_US-lessac-medium",  # Piper voice model
        "sample_rate": 22050,
    },
}

# ============ GLOBALS ============
app = FastAPI(title="Voice Assistant Server")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-loaded models
whisper_model: WhisperModel | None = None
piper_voice: PiperVoice | None = None
conversation_history: list[dict] = []


def get_whisper_model() -> WhisperModel:
    """Lazy load Whisper model"""
    global whisper_model
    if whisper_model is None:
        print(f"Loading Whisper model: {CONFIG['stt']['model_size']}...")
        whisper_model = WhisperModel(
            CONFIG["stt"]["model_size"],
            device=CONFIG["stt"]["device"],
            compute_type=CONFIG["stt"]["compute_type"],
        )
        print("Whisper model loaded!")
    return whisper_model


def get_piper_voice() -> PiperVoice:
    """Lazy load Piper TTS voice"""
    global piper_voice
    if piper_voice is None:
        print(f"Loading Piper voice: {CONFIG['tts']['model']}...")
        # Piper will auto-download the model if not present
        piper_voice = PiperVoice.load(CONFIG["tts"]["model"])
        print("Piper voice loaded!")
    return piper_voice


def init_conversation():
    """Initialize conversation with system prompt"""
    global conversation_history
    conversation_history = [
        {"role": "system", "content": CONFIG["ollama"]["system_prompt"]}
    ]


# ============ STT ============
def transcribe_audio(audio_data: bytes, sample_rate: int = 16000) -> str:
    """Transcribe audio bytes to text using Whisper"""
    model = get_whisper_model()

    # Convert bytes to numpy array (assuming 16-bit PCM)
    audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

    segments, info = model.transcribe(
        audio_np,
        beam_size=5,
        language="en",
        vad_filter=True,
    )

    text = " ".join(segment.text for segment in segments).strip()
    return text


# ============ LLM ============
async def chat_stream(user_message: str) -> AsyncGenerator[str, None]:
    """Stream chat response from Ollama"""
    global conversation_history

    conversation_history.append({"role": "user", "content": user_message})

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{CONFIG['ollama']['base_url']}/api/chat",
            json={
                "model": CONFIG["ollama"]["model"],
                "messages": conversation_history,
                "stream": True,
            },
        ) as response:
            full_response = ""
            async for line in response.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if content := data.get("message", {}).get("content"):
                            full_response += content
                            yield content
                    except json.JSONDecodeError:
                        pass

            conversation_history.append({"role": "assistant", "content": full_response})


# ============ TTS ============
def synthesize_speech(text: str) -> bytes:
    """Synthesize text to speech, returns WAV audio bytes"""
    voice = get_piper_voice()

    # Generate audio
    audio_data = []
    for audio_bytes in voice.synthesize_stream_raw(text):
        audio_data.append(audio_bytes)

    # Combine all audio chunks
    raw_audio = b"".join(audio_data)

    # Create WAV file in memory
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(CONFIG["tts"]["sample_rate"])
        wav_file.writeframes(raw_audio)

    return wav_buffer.getvalue()


async def synthesize_speech_streaming(text: str) -> AsyncGenerator[bytes, None]:
    """Stream TTS audio chunks as they're generated"""
    voice = get_piper_voice()

    # Stream raw PCM audio chunks
    for audio_bytes in voice.synthesize_stream_raw(text):
        yield audio_bytes


# ============ WEBSOCKET HANDLER ============
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for voice assistant

    Protocol:
    - Client sends: {"type": "audio", "data": "<base64 PCM audio>", "sample_rate": 16000}
    - Client sends: {"type": "end_audio"} when done recording
    - Server sends: {"type": "transcript", "text": "..."}
    - Server sends: {"type": "response_text", "text": "...", "done": false}
    - Server sends: {"type": "audio", "data": "<base64 PCM audio>"}
    - Server sends: {"type": "done"}
    """
    await websocket.accept()
    print("Client connected")

    # Initialize conversation for this session
    init_conversation()

    audio_buffer = bytearray()
    sample_rate = 16000

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "audio":
                # Accumulate audio chunks
                import base64
                audio_chunk = base64.b64decode(data["data"])
                audio_buffer.extend(audio_chunk)
                sample_rate = data.get("sample_rate", 16000)

            elif msg_type == "end_audio":
                if not audio_buffer:
                    await websocket.send_json({"type": "error", "message": "No audio received"})
                    continue

                # 1. Transcribe audio
                print("Transcribing...")
                transcript = transcribe_audio(bytes(audio_buffer), sample_rate)
                print(f"Transcript: {transcript}")

                await websocket.send_json({"type": "transcript", "text": transcript})

                if not transcript:
                    await websocket.send_json({"type": "error", "message": "Could not transcribe audio"})
                    audio_buffer.clear()
                    continue

                # 2. Stream LLM response and TTS
                print("Generating response...")
                full_response = ""
                sentence_buffer = ""
                sentence_enders = ".!?"

                async for chunk in chat_stream(transcript):
                    full_response += chunk
                    sentence_buffer += chunk

                    # Send text chunk to client
                    await websocket.send_json({
                        "type": "response_text",
                        "text": chunk,
                        "done": False
                    })

                    # Check for sentence boundaries for TTS
                    for ender in sentence_enders:
                        if ender in sentence_buffer:
                            idx = sentence_buffer.rfind(ender)
                            sentence = sentence_buffer[:idx + 1].strip()
                            sentence_buffer = sentence_buffer[idx + 1:]

                            if sentence:
                                # Synthesize and stream this sentence
                                print(f"Speaking: {sentence}")
                                async for audio_chunk in synthesize_speech_streaming(sentence):
                                    import base64
                                    await websocket.send_json({
                                        "type": "audio",
                                        "data": base64.b64encode(audio_chunk).decode(),
                                        "sample_rate": CONFIG["tts"]["sample_rate"]
                                    })
                            break

                # Speak any remaining text
                if sentence_buffer.strip():
                    print(f"Speaking final: {sentence_buffer.strip()}")
                    async for audio_chunk in synthesize_speech_streaming(sentence_buffer.strip()):
                        import base64
                        await websocket.send_json({
                            "type": "audio",
                            "data": base64.b64encode(audio_chunk).decode(),
                            "sample_rate": CONFIG["tts"]["sample_rate"]
                        })

                await websocket.send_json({"type": "response_text", "text": "", "done": True})
                await websocket.send_json({"type": "done"})

                print(f"Full response: {full_response}")
                audio_buffer.clear()

            elif msg_type == "clear_history":
                init_conversation()
                await websocket.send_json({"type": "history_cleared"})

    except WebSocketDisconnect:
        print("Client disconnected")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.on_event("startup")
async def startup():
    """Preload models on startup"""
    print("Voice Assistant Server starting...")
    # Models will be lazy-loaded on first use
    # Uncomment below to preload:
    # get_whisper_model()
    # get_piper_voice()
    print("Server ready!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

