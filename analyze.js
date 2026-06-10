/**
 * analyze.js — content generation engine for CreatorKit
 * All processing is local — no external API needed.
 */

// ── Stop words (PT + EN) ──────────────────────────────────────
const STOP_WORDS = new Set([
  // PT
  'a','ao','aos','aquela','aquelas','aquele','aqueles','aquilo','as','até','com',
  'como','da','das','de','dela','delas','dele','deles','depois','do','dos','e',
  'ela','elas','ele','eles','em','entre','era','eram','essa','essas','esse',
  'esses','esta','estas','este','estes','eu','foi','for','foram','há','isso',
  'isto','já','lhe','lhes','mais','mas','me','mesmo','meu','minha','muito',
  'na','nas','nem','no','nos','nós','não','num','numa','o','os','ou','para',
  'pela','pelas','pelo','pelos','por','que','qual','quando','quem','são','se',
  'sem','ser','seu','seus','si','sua','suas','também','te','tem','ter','teu',
  'tua','tuas','tudo','um','uma','uns','umas','vai','vem','você','vocês','à',
  'às','é','isso','assim','então','agora','aqui','ali','lá','ainda','logo',
  'porque','então','pois','portanto','todavia','porém','entanto','contudo',
  'apenas','só','todo','toda','todos','todas','cada','outro','outra','outros',
  'outras','tal','tais','tanto','tantos','tanta','tantas','bem','mal','muito',
  'pouco','sempre','nunca','jamais','hoje','ontem','amanhã','quando','onde',
  // EN
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'as','is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'can','this','that','these','those','i','we','you','he','she','they','it',
  'my','our','your','his','her','their','its','me','us','him','them','who',
  'what','which','how','when','where','why','all','any','both','each',
  'few','more','most','other','some','such','no','not','only','same','so',
  'than','too','very','just','about','above','after','again','also','before',
  'between','here','into','like','now','out','over','own','then','there',
  'through','under','until','up','while','from','if',
]);

// ── Tokenize & extract keywords ───────────────────────────────
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-záàãâäéèêëíìîïóòõôöúùûüçñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function extractKeywords(text, topN = 20) {
  const words = tokenize(text);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── Extractive summary ────────────────────────────────────────
function summarize(text, numSentences = 4) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= numSentences) return text.trim();

  const keywords = new Set(extractKeywords(text, 15).map(k => k.word));

  const scored = sentences.map(s => {
    const words = tokenize(s);
    const score = words.filter(w => keywords.has(w)).length / (words.length || 1);
    return { s: s.trim(), score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, numSentences)
    .sort((a, b) => sentences.indexOf(a.s) - sentences.indexOf(b.s))
    .map(x => x.s)
    .join(' ');
}

// ── Hashtag generator ─────────────────────────────────────────
function generateHashtags(text, keywords) {
  const tags = keywords
    .slice(0, 12)
    .map(k => '#' + k.word.replace(/\s+/g, '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

  // Detect topics and add contextual tags
  const lower = text.toLowerCase();
  const contextual = [];
  if (/negócio|empresa|empreend|startup|produto|vend/.test(lower)) contextual.push('#empreendedorismo','#negócios','#business');
  if (/saúde|treino|exercício|academia|fitness|dieta/.test(lower)) contextual.push('#saúde','#fitness','#bemestar');
  if (/tecnologia|tech|software|programação|código|ia|inteligência/.test(lower)) contextual.push('#tecnologia','#tech','#inovação');
  if (/motivação|sucesso|crescimento|mindset|foco/.test(lower)) contextual.push('#motivação','#sucesso','#mindset');
  if (/receita|cozinha|comida|culinária|alimento/.test(lower)) contextual.push('#gastronomia','#culinária','#foodlover');
  if (/moda|roupa|estilo|fashion|look/.test(lower)) contextual.push('#moda','#fashion','#estilo');
  if (/viagem|destino|turismo|lugar|cidade/.test(lower)) contextual.push('#viagem','#turismo','#travel');
  if (/financ|invest|dinheiro|renda|rico/.test(lower)) contextual.push('#finanças','#investimento','#dinheiro');
  if (/relacionamento|amor|família|casal|vida/.test(lower)) contextual.push('#relacionamentos','#vidapessoal');

  const all = [...new Set([...tags, ...contextual, '#conteúdo', '#influencer', '#viral'])];
  return all.slice(0, 25);
}

// ── Instagram Caption ─────────────────────────────────────────
function generateInstagramCaption(text, keywords, hashtags, lang) {
  const summary = summarize(text, 2);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const hook = sentences[0]?.trim() || summary.split('.')[0];
  const kws = keywords.slice(0, 3).map(k => k.word);

  const ctas = [
    '💬 Me conta o que você achou nos comentários!',
    '👇 Qual foi o ponto que mais te chamou atenção?',
    '🔁 Salva esse conteúdo para não perder!',
    '📲 Manda pra um amigo que precisa ver isso!',
    '✨ Segue para mais conteúdo como esse!',
  ];
  const cta = ctas[Math.floor(Math.random() * ctas.length)];

  const topHashtags = hashtags.slice(0, 15).join(' ');

  return `${hook}

✨ Neste conteúdo você vai ver:
${kws.map(k => `▸ ${k.charAt(0).toUpperCase() + k.slice(1)}`).join('\n')}

${summary}

${cta}

.
.
.
${topHashtags}`;
}

// ── YouTube Kit ───────────────────────────────────────────────
function generateYouTubeKit(text, keywords, segments) {
  const kws = keywords.slice(0, 5).map(k => k.word);

  // Title variations
  const firstSentence = (text.match(/[^.!?]+[.!?]+/)?.[0] || '').trim().slice(0, 60);
  const titles = [
    `${firstSentence || kws.slice(0,2).join(' e ')} | Conteúdo Completo`,
    `TUDO sobre ${kws[0] || 'esse tema'} que você precisa saber`,
    `${kws.slice(0,2).join(', ')} e muito mais — Veja agora!`,
  ];

  // Description
  const summary = summarize(text, 3);
  const tags = keywords.slice(0, 15).map(k => k.word).join(', ');

  // Timestamps from segments
  let timestampBlock = '';
  if (segments && segments.length > 0) {
    const interval = Math.max(1, Math.floor(segments.length / 8));
    const picks = segments.filter((_, i) => i % interval === 0).slice(0, 8);
    timestampBlock = '\n\n⏱️ CAPÍTULOS:\n' + picks.map(s => `${fmtTime(s.start)} ${s.text.slice(0, 50)}`).join('\n');
  }

  const description = `📌 ${summary}
${timestampBlock}

🔔 Inscreva-se no canal e ative o sininho para não perder nenhum vídeo!
👍 Se o conteúdo foi útil, deixa o like — ajuda muito!
💬 Tem alguma dúvida? Comenta aqui embaixo!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Minhas redes sociais:
▸ Instagram: @seuinstagram
▸ TikTok: @seutiktok
▸ Twitter: @seutwitter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#${kws.join(' #')}`;

  return { titles, description, tags };
}

// ── Twitter/X Thread ──────────────────────────────────────────
function generateTwitterThread(text, keywords) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map(s => s.trim()).filter(Boolean);
  const summary = summarize(text, 6);
  const sumSentences = (summary.match(/[^.!?]+[.!?]+/g) || [summary]).map(s => s.trim()).filter(Boolean);

  const tweets = [];
  const kws = keywords.slice(0, 3).map(k => k.word);

  // Tweet 1: hook
  tweets.push(`🧵 ${sentences[0] || kws.join(', ')}\n\nThread completa 👇`);

  // Middle tweets: pack sentences into 250 chars each
  let current = '';
  for (const s of sumSentences) {
    if ((current + ' ' + s).length > 250) {
      if (current) tweets.push(current.trim());
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current) tweets.push(current.trim());

  // Last tweet: CTA
  tweets.push(`📌 Gostou desse conteúdo?\n\n↩️ RT para compartilhar\n❤️ Like se foi útil\n🔔 Siga para mais\n\n#${kws.slice(0,3).join(' #')}`);

  return tweets.map((t, i) => `${i + 1}/${tweets.length}\n\n${t}`);
}

// ── LinkedIn Post ─────────────────────────────────────────────
function generateLinkedIn(text, keywords) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map(s => s.trim());
  const kws = keywords.slice(0, 5);
  const summary = summarize(text, 4);

  return `💡 ${sentences[0] || 'Reflexão importante'}

${summary}

3 pontos principais sobre ${kws[0]?.word || 'esse tema'}:

→ ${sentences[1]?.trim() || kws[0]?.word || ''}
→ ${sentences[2]?.trim() || kws[1]?.word || ''}
→ ${sentences[3]?.trim() || kws[2]?.word || ''}

O que você pensa sobre isso? Compartilhe nos comentários. 👇

━━━━━━━━━━━━━━━━━━━━━

${kws.slice(0, 5).map(k => `#${k.word}`).join(' ')} #linkedin #networking #conteúdo`;
}

// ── Blog Post ─────────────────────────────────────────────────
function generateBlogPost(text, keywords, title) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || [text]).map(s => s.trim()).filter(Boolean);
  const kws = keywords.slice(0, 6).map(k => k.word);
  const postTitle = title || `${kws[0]?.charAt(0).toUpperCase() + kws[0]?.slice(1) || 'Conteúdo'}: tudo o que você precisa saber`;

  // Split into chunks of ~3 sentences per section
  const sections = [];
  let chunk = [];
  for (const s of sentences) {
    chunk.push(s);
    if (chunk.length === 3) { sections.push(chunk.join(' ')); chunk = []; }
  }
  if (chunk.length) sections.push(chunk.join(' '));

  const sectionTitles = [
    'Introdução', 'Por que isso importa', 'Principais pontos',
    'Como aplicar na prática', 'Dicas e insights', 'Conclusão',
  ];

  let post = `# ${postTitle}\n\n`;
  post += `*Tempo de leitura: ~${Math.ceil(text.split(/\s+/).length / 200)} min*\n\n`;
  post += `---\n\n`;

  sections.slice(0, 5).forEach((section, i) => {
    post += `## ${sectionTitles[i] || `Parte ${i + 1}`}\n\n${section}\n\n`;
  });

  post += `## Conclusão\n\n${summarize(text, 2)}\n\n`;
  post += `---\n\n**Tags:** ${kws.join(', ')}`;

  return post;
}

// ── Main analyze function ─────────────────────────────────────
function analyze(text, segments = [], videoTitle = '') {
  if (!text || text.trim().length < 10) throw new Error('Texto muito curto para análise.');

  const keywords  = extractKeywords(text, 20);
  const hashtags  = generateHashtags(text, keywords);
  const summary   = summarize(text, 4);
  const instagram = generateInstagramCaption(text, keywords, hashtags);
  const yt        = generateYouTubeKit(text, keywords, segments);
  const thread    = generateTwitterThread(text, keywords);
  const linkedin  = generateLinkedIn(text, keywords);
  const blog      = generateBlogPost(text, keywords, videoTitle);

  const wordCount = text.trim().split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  return {
    summary,
    keywords: keywords.slice(0, 12),
    hashtags,
    instagram,
    youtube: yt,
    twitter: thread,
    linkedin,
    blog,
    stats: { wordCount, readingTime, sentenceCount: (text.match(/[.!?]+/g) || []).length },
  };
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}

// ══════════════════════════════════════════════════════════════
//  STANDALONE CREATOR TOOLS (topic-based, no video needed)
// ══════════════════════════════════════════════════════════════

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ── 🪝 HOOKS ──────────────────────────────────────────────────
function generateHooks(topic) {
  if (!topic || !topic.trim()) throw new Error('Informe um tópico.');
  const t = topic.trim().toLowerCase();
  const T = cap(t);

  const templates = [
    `Pare de errar em ${t} — faça assim a partir de hoje.`,
    `Ninguém te conta a verdade sobre ${t}...`,
    `Eu perdi anos errando em ${t}. Não cometa o mesmo erro.`,
    `3 verdades sobre ${t} que mudaram tudo pra mim.`,
    `O segredo de ${t} que os experts não compartilham.`,
    `Como eu dominei ${t} em apenas 30 dias.`,
    `A maioria das pessoas erra em ${t}. Veja como acertar.`,
    `${T} não é o que você imagina. Olha só isso.`,
    `Faça ISSO antes de tentar qualquer coisa com ${t}.`,
    `O maior mito sobre ${t} — desmascarado.`,
    `Se você quer resultado com ${t}, assista até o final.`,
    `Eu testei tudo sobre ${t} pra você não precisar.`,
    `Esse erro em ${t} está te custando caro (e você nem percebe).`,
    `${T} em 60 segundos: o guia que você precisava.`,
    `Por que 90% das pessoas falham em ${t}?`,
    `O que eu faria se tivesse que começar do zero em ${t}.`,
  ];
  return { topic, hooks: pick(templates, 10) };
}

// ── 💡 CONTENT IDEAS ──────────────────────────────────────────
function generateIdeas(niche) {
  if (!niche || !niche.trim()) throw new Error('Informe seu nicho.');
  const n = niche.trim().toLowerCase();
  const N = cap(n);

  const ideas = [
    { fmt: 'Reels',     icon: '🎬', title: `Top 5 erros que iniciantes cometem em ${n}` },
    { fmt: 'Carrossel', icon: '🖼️', title: `Mitos vs verdades sobre ${n}` },
    { fmt: 'Reels',     icon: '🎬', title: `Um dia na vida de quem trabalha com ${n}` },
    { fmt: 'YouTube',   icon: '▶️', title: `Tutorial passo a passo de ${n} para iniciantes` },
    { fmt: 'Carrossel', icon: '🖼️', title: `O que eu gostaria de saber antes de começar em ${n}` },
    { fmt: 'Story',     icon: '📲', title: `Caixinha de perguntas: tudo sobre ${n}` },
    { fmt: 'Reels',     icon: '🎬', title: `Antes e depois: minha evolução em ${n}` },
    { fmt: 'Carrossel', icon: '🖼️', title: `5 ferramentas essenciais para ${n}` },
    { fmt: 'YouTube',   icon: '▶️', title: `Reagindo às maiores tendências de ${n}` },
    { fmt: 'Reels',     icon: '🎬', title: `Desafio de 30 dias de ${n} — resultados reais` },
    { fmt: 'Carrossel', icon: '🖼️', title: `Guia rápido: ${n} do zero ao avançado` },
    { fmt: 'Reels',     icon: '🎬', title: `3 hábitos que transformaram meu ${n}` },
    { fmt: 'Story',     icon: '📲', title: `Bastidores: como eu produzo conteúdo de ${n}` },
    { fmt: 'YouTube',   icon: '▶️', title: `${N}: vale a pena em 2026? Minha opinião sincera` },
    { fmt: 'Carrossel', icon: '🖼️', title: `Os 7 termos de ${n} que todo mundo deveria saber` },
  ];
  return { niche, ideas: pick(ideas, 9) };
}

// ── ✍️ BIO GENERATOR ──────────────────────────────────────────
function generateBio({ name = '', niche = '', cta = '' }) {
  if (!niche.trim()) throw new Error('Informe seu nicho.');
  const n = niche.trim();
  const link = cta.trim() || '👇 Link abaixo';

  const bios = [
    `✨ ${name || 'Criador(a)'} | ${cap(n)}\n📍 Conteúdo diário sobre ${n.toLowerCase()}\n💡 Dicas que realmente funcionam\n${link}`,
    `${cap(n)} descomplicado 🚀\nAjudo você a evoluir em ${n.toLowerCase()}\n🎯 Novo conteúdo toda semana\n${link}`,
    `${name ? name + ' • ' : ''}Apaixonado(a) por ${n.toLowerCase()} 💜\nTransformando conhecimento em resultado\n📲 Me segue pra não perder nada\n${link}`,
    `Seu cantinho de ${n.toLowerCase()} 🌟\n✅ Conteúdo prático e direto\n✅ Sem enrolação\n${link}`,
  ];
  return { bios };
}

// ── 📅 CONTENT CALENDAR ───────────────────────────────────────
function generateCalendar({ niche = '', perWeek = 5 }) {
  if (!niche.trim()) throw new Error('Informe seu nicho.');
  const n = niche.trim().toLowerCase();
  const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const blocks = [
    { icon: '🎬', fmt: 'Reels',     theme: `Dica rápida de ${n}`,            best: '12h ou 19h' },
    { icon: '🖼️', fmt: 'Carrossel', theme: `Passo a passo sobre ${n}`,        best: '18h' },
    { icon: '📲', fmt: 'Story',      theme: `Bastidores + enquete de ${n}`,    best: 'Ao longo do dia' },
    { icon: '🎬', fmt: 'Reels',     theme: `Mito vs verdade de ${n}`,         best: '20h' },
    { icon: '▶️', fmt: 'YouTube',   theme: `Vídeo aprofundado de ${n}`,       best: 'Sábado 10h' },
    { icon: '🖼️', fmt: 'Carrossel', theme: `Lista: top ferramentas de ${n}`,  best: '17h' },
    { icon: '📲', fmt: 'Story',      theme: `Caixinha de perguntas de ${n}`,   best: 'Domingo' },
  ];
  const count = Math.min(Math.max(parseInt(perWeek) || 5, 1), 7);
  const plan = days.slice(0, count).map((d, i) => ({ day: d, ...blocks[i % blocks.length] }));
  return { niche, plan };
}

// ── 📸 CAPTION FROM TOPIC ─────────────────────────────────────
function generateCaptionFromTopic(topic) {
  if (!topic || !topic.trim()) throw new Error('Informe um tópico.');
  const t = topic.trim();
  const keywords = extractKeywords(t + ' ' + t, 10);
  const hashtags = generateHashtags(t, keywords);
  const ctas = [
    '💬 Comenta aqui o que você achou!',
    '🔁 Salva esse post para não esquecer!',
    '📲 Marca um amigo que precisa ver isso!',
    '✨ Segue pra mais conteúdo como esse!',
  ];
  const caption = `${cap(t)} 🚀\n\nVocê sabia disso? Deixa eu te explicar de um jeito simples 👇\n\n▸ Ponto 1 sobre ${t.toLowerCase()}\n▸ Ponto 2 que faz a diferença\n▸ Ponto 3 que ninguém te conta\n\n${pick(ctas, 1)[0]}\n\n.\n.\n.\n${hashtags.slice(0, 15).join(' ')}`;
  return { caption, hashtags };
}

// ── 📝 SCRIPT / ROTEIRO ───────────────────────────────────────
function generateScript({ topic = '', format = 'reels' }) {
  if (!topic.trim()) throw new Error('Informe o tema do vídeo.');
  const t = topic.trim().toLowerCase();
  const T = cap(t);

  const hooks = [
    `Pare tudo: se você se interessa por ${t}, precisa ver isso.`,
    `Ninguém te conta a verdade sobre ${t}...`,
    `Eu errei MUITO em ${t} até descobrir isso.`,
    `Esse erro em ${t} está te custando caro.`,
    `${T} em 30 segundos — presta atenção.`,
  ];
  const ctas = [
    `Salva esse vídeo pra não esquecer e segue pra mais conteúdo sobre ${t}! 🚀`,
    `Comenta aqui embaixo a sua maior dúvida sobre ${t}. Eu respondo todo mundo! 💬`,
    `Marca aquele amigo que precisa ver isso e me segue pra mais dicas! 📲`,
  ];

  const isYT = format === 'youtube';

  const sections = [
    { label: '🎣 Gancho (0–3s)', tip: 'Fale isso olhando pra câmera, com energia.', text: pick(hooks, 1)[0] },
    { label: '🎬 Contexto (3–10s)', tip: 'Mostre que você entende a dor de quem assiste.', text: `Se você sente que ${t} é complicado ou já tentou e não deu certo, relaxa — eu vou simplificar tudo pra você agora.` },
    { label: '📍 Ponto 1', tip: 'Primeira ideia prática.', text: `O primeiro passo em ${t} é entender o fundamento. A maioria pula essa parte e é por isso que trava.` },
    { label: '📍 Ponto 2', tip: 'Segunda ideia, aprofunde.', text: `Depois disso, foque em consistência. Pequenas ações repetidas valem mais do que grandes esforços isolados.` },
    { label: '📍 Ponto 3', tip: 'Terceira ideia, a mais forte.', text: `E o pulo do gato: ${t} funciona muito melhor quando você acompanha os resultados e ajusta no caminho.` },
    { label: '🔥 Virada', tip: 'O insight que prende até o fim.', text: `Mas o que quase ninguém te conta é que ${t} não é sobre fazer mais — é sobre fazer o certo, de forma constante.` },
    { label: '📢 Chamada pra ação', tip: 'Diga exatamente o que fazer agora.', text: pick(ctas, 1)[0] },
  ];

  if (isYT) {
    sections.splice(2, 0, { label: '👋 Intro do canal (10–20s)', tip: 'Só no YouTube — apresente-se rápido.', text: `Se é a primeira vez aqui no canal, seja muito bem-vindo! Aqui a gente fala sobre ${t} de um jeito direto e sem enrolação. Bora?` });
  }

  const full = sections.map(s => `${s.label}\n${s.text}`).join('\n\n');
  const wordCount = full.split(/\s+/).length;
  const estSeconds = Math.round(wordCount / 2.5); // ~150 wpm falado

  return { topic, format, sections, full, estSeconds };
}

// ── #️⃣ HASHTAGS FROM TOPIC ────────────────────────────────────
function generateHashtagsFromTopic(topic) {
  if (!topic || !topic.trim()) throw new Error('Informe um tópico.');
  const keywords = extractKeywords(topic + ' ' + topic, 12);
  const hashtags = generateHashtags(topic, keywords);
  return { hashtags };
}

// ── DISPATCHER ────────────────────────────────────────────────
function generateTools(type, params = {}) {
  switch (type) {
    case 'hooks':    return generateHooks(params.topic);
    case 'ideas':    return generateIdeas(params.niche);
    case 'bio':      return generateBio(params);
    case 'calendar': return generateCalendar(params);
    case 'caption':  return generateCaptionFromTopic(params.topic);
    case 'script':   return generateScript(params);
    case 'hashtags': return generateHashtagsFromTopic(params.topic);
    default: throw new Error('Ferramenta desconhecida: ' + type);
  }
}

module.exports = { analyze, generateTools };
