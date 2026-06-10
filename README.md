# ✦ CreatorKit

Plataforma local para criadores de conteúdo. Transcreve vídeos e gera caption, thread, post de blog, hooks, ideias, hashtags, bio, roteiro e calendário — tudo processado na própria máquina/servidor, sem API externa.

## 🧰 Ferramentas

| Ferramenta | Precisa de vídeo? |
|---|---|
| 🎬 Estúdio de Vídeo (transcrição → 9 saídas) | Sim |
| 🪝 Gerador de Hooks | Não |
| 💡 Ideias de Conteúdo | Não |
| 📝 Roteiro de Vídeo | Não |
| #️⃣ Hashtags por Tema | Não |
| ✍️ Bio de Perfil | Não |
| 📅 Calendário de Posts | Não |

## 🚀 Rodar localmente

Requisitos: **Node.js 18+**.

```bash
npm install
npm start
```

Acesse http://localhost:5050

O `yt-dlp` é baixado automaticamente na primeira execução. O `ffmpeg` já vem embutido via `ffmpeg-static`. O modelo Whisper (~250 MB no `small`) é baixado na primeira transcrição e fica em cache.

## 🐳 Deploy com Docker

```bash
docker build -t creatorkit .
docker run -p 5050:5050 creatorkit
```

A imagem já inclui `ffmpeg`, `python3` e `yt-dlp`.

## ☁️ Deploy em Render / Railway / Fly.io

O projeto está pronto para qualquer plataforma que rode Docker:

1. Suba o repositório no GitHub.
2. Crie um serviço apontando para o repo (deixe a plataforma detectar o `Dockerfile`).
3. A porta é lida de `process.env.PORT` automaticamente.
4. Health check disponível em `/health`.

### Variáveis de ambiente (opcionais)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `5050` | Porta do servidor |
| `YTDLP_PATH` | `/usr/local/bin/yt-dlp` (Docker) | Caminho do binário yt-dlp |
| `XENOVA_CACHE_DIR` | `/app/.cache` | Cache dos modelos Whisper |

## ⚠️ Considerações de produção

- **Whisper é pesado de CPU.** Em instâncias pequenas (512 MB–1 GB), use os modelos `tiny` ou `base`. O `medium`/`large` exigem servidores com mais memória/CPU.
- **Downloads de Instagram/YouTube** podem ser bloqueados a partir de IPs de datacenter. Funciona melhor em IP residencial; em nuvem pode exigir cookies/login.
- O processamento é **single-instance** (jobs ficam em memória). Para escalar horizontalmente, seria necessário uma fila externa (ex.: Redis).
- Arquivos temporários e jobs antigos são limpos automaticamente a cada 15 min (TTL de 1 h).

## 📄 Licença

ISC
