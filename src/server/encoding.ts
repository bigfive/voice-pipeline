/**
 * Server-side Audio Encoding Utilities
 *
 * Uses Node.js Buffer for better performance than browser-based encoding.
 */

/**
 * Encode Float32Array to base64 string (Node.js optimized)
 */
export function float32ToBase64Node(audio: Float32Array): string {
  // Create a new buffer and copy data to ensure alignment
  const buffer = Buffer.alloc(audio.length * 4);
  for (let i = 0; i < audio.length; i++) {
    buffer.writeFloatLE(audio[i], i * 4);
  }
  return buffer.toString('base64');
}

/**
 * Decode base64 string to Float32Array (Node.js optimized)
 */
export function base64ToFloat32Node(data: string): Float32Array {
  const buffer = Buffer.from(data, 'base64');
  const float32 = new Float32Array(buffer.length / 4);
  for (let i = 0; i < float32.length; i++) {
    float32[i] = buffer.readFloatLE(i * 4);
  }
  return float32;
}

/**
 * Concatenate multiple Float32Arrays into one
 */
export function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

