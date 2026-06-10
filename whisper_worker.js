// Runs as: node whisper_worker.js <audioPath> <model> <language>
const [, , audioPath, modelName, language, task = 'transcribe'] = process.argv;
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

async function main() {
  const { pipeline, env } = await import('@xenova/transformers');

  env.cacheDir = process.env.XENOVA_CACHE_DIR || path.join(__dirname, '.cache');
  // Suppress verbose ONNX logs
  env.backends.onnx.logLevel = 'error';

  process.stderr.write(`Carregando modelo ${modelName}...\n`);

  const transcriber = await pipeline('automatic-speech-recognition', modelName);

  process.stderr.write('Convertendo áudio para PCM...\n');

  // Convert audio to raw 32-bit float PCM (16kHz mono) using ffmpeg
  const rawPath = audioPath + '.f32le';
  execFileSync(ffmpegStatic, [
    '-i', audioPath,
    '-ar', '16000',
    '-ac', '1',
    '-f', 'f32le',
    '-y', rawPath,
  ], { stdio: 'pipe' });

  const rawBuffer = fs.readFileSync(rawPath);
  fs.unlink(rawPath, () => {});

  // Build Float32Array from raw PCM bytes
  const audioData = new Float32Array(
    rawBuffer.buffer,
    rawBuffer.byteOffset,
    rawBuffer.byteLength / 4
  );

  process.stderr.write('Transcrevendo...\n');

  const opts = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  };
  if (language && language !== 'auto') opts.language = language;
  opts.task = task === 'translate' ? 'translate' : 'transcribe';

  const result = await transcriber(audioData, opts);

  const segments = (result.chunks || []).map(c => ({
    start: c.timestamp?.[0] ?? 0,
    end: c.timestamp?.[1] ?? 0,
    text: c.text.trim(),
  }));

  process.stdout.write(JSON.stringify({
    text: result.text.trim(),
    language: language !== 'auto' ? language : '',
    segments,
  }));
}

main().catch(e => {
  process.stderr.write('ERRO: ' + e.message + '\n');
  process.exit(1);
});
