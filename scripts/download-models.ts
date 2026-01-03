/**
 * Download Whisper and Piper models for sherpa-onnx
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const MODELS_DIR = join(import.meta.dirname, "..", "server", "models");

const MODELS = {
  whisper: {
    name: "sherpa-onnx-whisper-small.en",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.en.tar.bz2",
  },
  piper: {
    name: "vits-piper-en_US-lessac-medium",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
  },
};

async function downloadAndExtract(name: string, url: string): Promise<void> {
  const modelPath = join(MODELS_DIR, name);

  if (existsSync(modelPath)) {
    console.log(`✓ ${name} already exists, skipping...`);
    return;
  }

  console.log(`Downloading ${name}...`);
  const tarFile = join(MODELS_DIR, `${name}.tar.bz2`);

  // Download
  execSync(`curl -L -o "${tarFile}" "${url}"`, { stdio: "inherit" });

  // Extract
  console.log(`Extracting ${name}...`);
  execSync(`tar -xjf "${tarFile}" -C "${MODELS_DIR}"`, { stdio: "inherit" });

  // Cleanup
  execSync(`rm "${tarFile}"`);

  console.log(`✓ ${name} ready`);
}

async function main() {
  console.log("Downloading models for sherpa-onnx...\n");

  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
  }

  await downloadAndExtract(MODELS.whisper.name, MODELS.whisper.url);
  await downloadAndExtract(MODELS.piper.name, MODELS.piper.url);

  console.log("\n✓ All models downloaded!");
  console.log(`  Models directory: ${MODELS_DIR}`);
}

main().catch(console.error);

