/**
 * Voice Pipeline Library - Type Definitions
 */

// ============ Message Types ============

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

// ============ Audio Types ============

export interface AudioResult {
  audio: Float32Array;
  sampleRate: number;
}

// ============ Progress Types ============

export interface ProgressInfo {
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

// ============ Pipeline Interfaces ============

export interface STTPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  transcribe(audio: Float32Array): Promise<string>;
  isReady(): boolean;
}

export interface LLMPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  generate(messages: Message[], onToken: (token: string) => void): Promise<string>;
  isReady(): boolean;
}

export interface TTSPipeline {
  initialize(onProgress?: ProgressCallback): Promise<void>;
  synthesize(text: string): Promise<AudioResult>;
  isReady(): boolean;
}

// ============ Tool/Function Types ============

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, ToolParameter>;
  handler: (args: Record<string, unknown>) => string | Promise<string>;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionResult {
  name: string;
  result: string;
}

// ============ Backend Config Types ============

export interface TransformersSTTConfig {
  model: string;
  dtype: string;
  language?: string;
  device?: 'webgpu' | 'cpu';
}

export interface TransformersLLMConfig {
  model: string;
  dtype: string;
  maxNewTokens: number;
  temperature: number;
  device?: 'webgpu' | 'cpu';
}

export interface TransformersTTSConfig {
  model: string;
  dtype: string;
  speakerEmbeddings: string;
  device?: 'webgpu' | 'cpu';
}

export interface NativeSTTConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
}

export interface NativeLLMConfig {
  binaryPath: string;
  modelPath: string;
  maxNewTokens: number;
  temperature: number;
  gpuLayers?: number;
}

export interface NativeTTSConfig {
  binaryPath: string;
  modelPath: string;
}

