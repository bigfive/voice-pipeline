#!/usr/bin/env node
/**
 * Voice Pipeline CLI
 * Usage: npx voice-pipeline <command>
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = process.argv[2];

function printHelp() {
  console.log(`
voice-pipeline - Isomorphic STT → LLM → TTS pipeline

Commands:
  setup     Download models and set up native binaries for server-side inference
  help      Show this help message

Examples:
  npx voice-pipeline setup    # Download ~2GB of models and binaries

For more info: https://github.com/your-username/voice-pipeline
`);
}

async function runSetup() {
  // Find the setup script relative to this CLI file
  // In dist/cli.js, the script is at ../scripts/setup.sh
  const scriptPath = join(__dirname, '..', 'scripts', 'setup.sh');
  const cacheDir = process.env.VOICE_PIPELINE_CACHE || join(process.env.HOME || '~', '.cache', 'voice-pipeline');

  console.log('Running setup script...');
  console.log('This will download models (~2GB) and set up native binaries.');
  console.log(`Cache location: ${cacheDir}\n`);

  const child = spawn('bash', [scriptPath], {
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    if (err.message.includes('ENOENT')) {
      console.error('Error: bash not found. Please run the setup script manually:');
      console.error(`  bash ${scriptPath}`);
    } else {
      console.error('Error running setup:', err.message);
    }
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

switch (command) {
  case 'setup':
    runSetup();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

