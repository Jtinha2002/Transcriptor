const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const { execFile, spawn } = require('child_process');
const { randomUUID } = require('crypto');
const ffmpegStatic = require('ffmpeg-static');
const YTDlpWrap    = require('yt-dlp-wrap').default;
const multer       = require('multer');
const helmet       = require('helmet');
const compression  = require('compression');
const { analyze, generateTools } = require('./analyze');

// ── Config ────────────────────────────────────────────────────
const PORT        = process.env.PORT || 5050;
const IS_WIN      = process.platform === 'win32';
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const UPLOADS_DIR   = path.join(__dirname, 'uploads');
const YTDLP_PATH    = process.env.YTDLP_PATH ||
  path.join(__dirname, 'bin', IS_WIN ? 'yt-dlp.exe' : 'yt-dlp');
const JOB_TTL_MS    = 60 * 60 * 1000; // 1h: jobs e arquivos temporários expiram
const DL_TIMEOUT_MS = 3 * 60 * 1000;  // 3min: timeout do download (yt-dlp)
const TR_TIMEOUT_MS = 10 * 60 * 1000; // 10min: timeout da transcrição (Whisper)

[DOWNLOADS_DIR, UPLOADS_DIR, path.join(__dirname, 'bin')].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── App ───────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,       // página usa estilos/scripts inline + fontes/thumbs externas
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

// ── In-memory job store (single instance) ─────────────────────
const jobs = {};

function newJob() {
  const id = randomUUID();
  jobs[id] = { status: 'queued', text: '', error: '', language: '', segments: [], createdAt: Date.now() };
  return id;
}
function finishJob(id, result) {
  if (!jobs[id]) return;
  Object.assign(jobs[id], {
    status: 'done',
    text: result.text,
    language: result.language || '',
    segments: result.segments || [],
  });
}
function failJob(id, msg) {
  if (jobs[id]) Object.assign(jobs[id], { status: 'error', error: msg });
  console.error(`[job ${id}] erro:`, msg);
}

// Limpeza periódica de jobs antigos + arquivos órfãos
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of Object.entries(jobs)) {
    if (now - (job.createdAt || 0) > JOB_TTL_MS) delete jobs[id];
  }
  for (const dir of [DOWNLOADS_DIR, UPLOADS_DIR]) {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(f => {
        const fp = path.join(dir, f);
        fs.stat(fp, (e, st) => {
          if (!e && now - st.mtimeMs > JOB_TTL_MS) fs.unlink(fp, () => {});
        });
      });
    });
  }
}, 15 * 60 * 1000).unref();

// ── yt-dlp / ffmpeg helpers ───────────────────────────────────
let ytdlpReady = null;
async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) return;
  if (!ytdlpReady) {
    ytdlpReady = (async () => {
      console.log('Baixando yt-dlp...');
      await YTDlpWrap.downloadFromGithub(YTDLP_PATH);
      if (!IS_WIN) { try { fs.chmodSync(YTDLP_PATH, 0o755); } catch {} }
      console.log('yt-dlp pronto.');
    })();
  }
  return ytdlpReady;
}

/** Traduz erros comuns do yt-dlp para mensagens claras */
function cleanYtDlpError(stderr = '') {
  const s = stderr.toLowerCase();
  if (s.includes('login required') || s.includes('log in') || s.includes('rate-limit') || s.includes('cookies'))
    return 'Esse vídeo exige login (comum em contas privadas ou Instagram). Tente um link público.';
  if (s.includes('private'))      return 'Esse vídeo é privado e não pode ser baixado.';
  if (s.includes('unavailable') || s.includes('not available') || s.includes('removed'))
    return 'Vídeo indisponível ou removido.';
  if (s.includes('unsupported url') || s.includes('no video') || s.includes('unable to extract'))
    return 'Não foi possível ler esse link. Verifique se é um link de vídeo válido.';
  if (s.includes('404'))          return 'Vídeo não encontrado (404).';
  return 'Não foi possível baixar o vídeo. O link pode estar protegido ou indisponível.';
}

/** Roda o yt-dlp via spawn com timeout e kill garantido. `capture` retorna o stdout. */
function runYtDlp(args, { timeoutMs = DL_TIMEOUT_MS, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_PATH, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let out = '', err = '', settled = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    if (capture && child.stdout) child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (timedOut) return reject(new Error('A operação demorou demais e foi cancelada. Tente um vídeo mais curto.'));
      if (code !== 0) return reject(new Error(cleanYtDlpError(err)));
      resolve(out);
    });
    child.on('error', e => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
  });
}

// Flags que fazem o yt-dlp falhar rápido em vez de ficar tentando pra sempre
const YTDLP_BASE = ['--no-playlist', '--no-warnings', '--socket-timeout', '20', '--retries', '2', '--extractor-retries', '1'];

async function getVideoInfo(url) {
  const raw = await runYtDlp([url, '--dump-json', ...YTDLP_BASE], { capture: true, timeoutMs: 45000 });
  const info = JSON.parse(raw);
  return {
    title:     info.title     || '',
    uploader:  info.uploader  || info.channel || '',
    thumbnail: info.thumbnail || '',
    duration:  info.duration  || 0,
    platform:  info.extractor_key || '',
  };
}

/** Converte qualquer áudio/vídeo para mp3 mono 16kHz (p/ Whisper) */
function convertToMp3(inputFile, outMp3, deleteInput = false, hq = false) {
  return new Promise((resolve, reject) => {
    const args = hq
      ? ['-i', inputFile, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outMp3]
      : ['-i', inputFile, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', '-y', outMp3];
    execFile(ffmpegStatic, args, { stdio: 'pipe' }, (err) => {
      if (deleteInput) fs.unlink(inputFile, () => {});
      if (err) reject(new Error('Erro ao converter áudio: ' + err.message));
      else resolve();
    });
  });
}

async function downloadAudioFromUrl(jobId, url, setStatus = () => {}) {
  const outMp3 = path.join(DOWNLOADS_DIR, `${jobId}.mp3`);
  const tmpOut = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);
  await runYtDlp([url, '--format', 'bestaudio/best', '--output', tmpOut, ...YTDLP_BASE]);
  const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId) && !f.endsWith('.mp3'));
  if (!files.length) throw new Error('Não foi possível baixar o áudio desse vídeo.');
  setStatus('extracting');
  await convertToMp3(path.join(DOWNLOADS_DIR, files[0]), outMp3, true);
  return outMp3;
}

/** Roda o Whisper num processo filho */
function transcribeAudio(mp3Path, modelName, language, task = 'transcribe') {
  return new Promise((resolve, reject) => {
    const worker = path.join(__dirname, 'whisper_worker.js');
    const child = spawn(process.execPath, [worker, mp3Path, modelName, language, task], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch {} }, TR_TIMEOUT_MS);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { const l = d.toString().trim(); if (l) { stderr += l + '\n'; console.log('[worker]', l); } });
    child.on('close', code => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (timedOut) return reject(new Error('A transcrição demorou demais. Tente um vídeo mais curto ou o modelo "Tiny".'));
      if (code !== 0) return reject(new Error('Falha ao transcrever o áudio.'));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error('Resposta inválida do transcritor.')); }
    });
    child.on('error', err => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } });
  });
}

// ── Pipelines ─────────────────────────────────────────────────
async function runUrlJob(jobId, url, model, language, task) {
  let mp3 = null;
  try {
    jobs[jobId].status = 'downloading_ytdlp'; await ensureYtDlp();
    jobs[jobId].status = 'downloading';
    mp3 = await downloadAudioFromUrl(jobId, url, s => { jobs[jobId].status = s; });
    jobs[jobId].status = 'transcribing';
    finishJob(jobId, await transcribeAudio(mp3, model, language, task));
  } catch (e) { failJob(jobId, e.message); }
  finally { if (mp3 && fs.existsSync(mp3)) fs.unlink(mp3, () => {}); }
}

async function runFileJob(jobId, filePath, model, language, task) {
  let mp3 = null;
  try {
    jobs[jobId].status = 'extracting';
    mp3 = path.join(DOWNLOADS_DIR, `${jobId}.mp3`);
    await convertToMp3(filePath, mp3, true);
    jobs[jobId].status = 'transcribing';
    finishJob(jobId, await transcribeAudio(mp3, model, language, task));
  } catch (e) {
    failJob(jobId, e.message);
    if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  } finally { if (mp3 && fs.existsSync(mp3)) fs.unlink(mp3, () => {}); }
}

// ── Routes ────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL não informada' });
  try { await ensureYtDlp(); res.json(await getVideoInfo(url)); }
  catch (e) { res.status(400).json({ error: 'Não foi possível obter informações do vídeo.' }); }
});

app.post('/transcribe', (req, res) => {
  const { url, model = 'Xenova/whisper-small', language = 'auto', task = 'transcribe' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL não informada' });
  const jobId = newJob();
  runUrlJob(jobId, url, model, language, task);
  res.json({ job_id: jobId });
});

app.post('/transcribe-file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  const { model = 'Xenova/whisper-small', language = 'auto', task = 'transcribe' } = req.body;
  const jobId = newJob();
  runFileJob(jobId, req.file.path, model, language, task);
  res.json({ job_id: jobId });
});

app.post('/analyze', (req, res) => {
  const { text, segments, title } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto não informado' });
  try { res.json(analyze(text, segments || [], title || '')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/generate', (req, res) => {
  const { type, ...params } = req.body;
  if (!type) return res.status(400).json({ error: 'Tipo de ferramenta não informado' });
  try { res.json(generateTools(type, params)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  res.json(job);
});

/** Stream helper: envia arquivo e remove ao terminar */
function streamAndCleanup(res, filePath, downloadName, contentType) {
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', contentType);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  const cleanup = () => fs.unlink(filePath, () => {});
  stream.on('close', cleanup);
  res.on('close', cleanup);
}

app.post('/download-video', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL não informada' });
  try {
    await ensureYtDlp();
    const id = randomUUID();
    const out = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);
    await runYtDlp([url,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', ffmpegStatic,
      '--output', out, ...YTDLP_BASE]);
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(id));
    if (!files.length) return res.status(500).json({ error: 'Falha ao baixar vídeo.' });
    streamAndCleanup(res, path.join(DOWNLOADS_DIR, files[0]), 'video.mp4', 'video/mp4');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/download-audio', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL não informada' });
  try {
    await ensureYtDlp();
    const id = randomUUID();
    const mp3Out = path.join(DOWNLOADS_DIR, `${id}.mp3`);
    const tmpOut = path.join(DOWNLOADS_DIR, `${id}.%(ext)s`);
    await runYtDlp([url, '--format', 'bestaudio/best', '--output', tmpOut, ...YTDLP_BASE]);
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(id) && !f.endsWith('.mp3'));
    if (!files.length) return res.status(500).json({ error: 'Falha ao baixar áudio.' });
    await convertToMp3(path.join(DOWNLOADS_DIR, files[0]), mp3Out, true, true);
    streamAndCleanup(res, mp3Out, 'audio.mp3', 'audio/mpeg');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Handler global de erros (ex.: arquivo grande demais no multer)
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

// ── Start + graceful shutdown ─────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n✅ CreatorKit rodando em http://localhost:${PORT}  (${process.env.NODE_ENV || 'development'})\n`);
});

function shutdown(sig) {
  console.log(`\n${sig} recebido, encerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
['SIGTERM', 'SIGINT'].forEach(s => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', r => console.error('Rejeição não tratada:', r));
