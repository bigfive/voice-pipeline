/**
 * Audio Recorder
 *
 * Handles microphone capture with AudioWorklet for real-time PCM streaming.
 */

export interface AudioRecorderConfig {
  /** Sample rate for recording (default: 16000) */
  sampleRate?: number;
}

export type AudioChunkCallback = (chunk: Float32Array) => void;

const PCM_WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      // Convert to Int16 for transmission efficiency
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
`;

export class AudioRecorder {
  private sampleRate: number;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletRegistered = false;
  private isRecording = false;
  private onChunkCallback: AudioChunkCallback | null = null;

  constructor(config: AudioRecorderConfig = {}) {
    this.sampleRate = config.sampleRate ?? 16000;
  }

  /**
   * Check if currently recording
   */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Set callback for audio chunks (called during streaming recording)
   */
  onChunk(callback: AudioChunkCallback): void {
    this.onChunkCallback = callback;
  }

  /**
   * Start recording from microphone
   */
  async start(): Promise<void> {
    if (this.isRecording) return;
    this.isRecording = true;

    // Create fresh AudioContext for each session
    if (this.audioContext) {
      await this.audioContext.close();
      this.workletRegistered = false;
    }
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

    // Register worklet if needed
    if (!this.workletRegistered) {
      const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
      await this.audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
      this.workletRegistered = true;
    }

    // Get microphone stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Create audio graph
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // Handle audio chunks
    this.workletNode.port.onmessage = (e: MessageEvent<Int16Array>) => {
      if (this.onChunkCallback) {
        // Convert Int16 back to Float32
        const float32 = new Float32Array(e.data.length);
        for (let i = 0; i < e.data.length; i++) {
          float32[i] = e.data[i] / 32768.0;
        }
        this.onChunkCallback(float32);
      }
    };

    // Connect the graph
    this.mediaStreamSource.connect(this.workletNode);
  }

  /**
   * Stop recording and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isRecording) return;
    this.isRecording = false;

    // Disconnect nodes
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    // Stop media tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
      this.workletRegistered = false;
    }
  }

  /**
   * Clean up all resources
   */
  async dispose(): Promise<void> {
    await this.stop();
    this.onChunkCallback = null;
  }
}

