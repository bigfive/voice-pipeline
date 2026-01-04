/**
 * Audio Recorder Service
 * Captures microphone audio as PCM data
 */

export interface AudioRecorderConfig {
  sampleRate: number;
}

export type AudioChunkCallback = (chunk: Int16Array) => void;

export class AudioRecorder {
  private config: AudioRecorderConfig;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private _isRecording = false;
  private onChunk: AudioChunkCallback | null = null;

  constructor(config: AudioRecorderConfig) {
    this.config = config;
  }

  /** Start recording from microphone */
  async start(onChunk: AudioChunkCallback): Promise<void> {
    if (this._isRecording) return;

    this.onChunk = onChunk;
    this._isRecording = true;

    // Get microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.config.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Create AudioContext for processing
    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Create ScriptProcessor to capture raw PCM
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this._isRecording || !this.onChunk) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = this.float32ToInt16(inputData);
      this.onChunk(pcmData);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    console.log('Recording started');
  }

  /** Stop recording and clean up resources */
  async stop(): Promise<void> {
    if (!this._isRecording) return;

    this._isRecording = false;

    // Disconnect audio nodes
    if (this.source && this.processor) {
      this.source.disconnect();
      this.processor.disconnect();
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Stop microphone stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.processor = null;
    this.source = null;
    this.onChunk = null;

    console.log('Recording stopped');
  }

  /** Check if currently recording */
  isRecording(): boolean {
    return this._isRecording;
  }

  /** Convert Float32 audio samples to Int16 PCM */
  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }
}

