// New names (preferred)
export { NativeWhisperSTT } from './stt';
export { NativeLlama } from './llm';
export { NativeSherpaOnnxTTS, NativePiperTTS } from './tts';

// Legacy aliases for backwards compatibility
export { NativeWhisperSTT as NativeWhisperPipeline } from './stt';
export { NativeLlama as NativeLlamaPipeline } from './llm';
export { NativeSherpaOnnxTTS as NativeSherpaOnnxTTSPipeline, NativePiperTTS as NativePiperPipeline } from './tts';

