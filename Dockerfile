# CreatorKit — imagem de produção
# Debian slim (glibc) porque o onnxruntime do Whisper não roda bem em Alpine/musl.
FROM node:20-slim

# Dependências de sistema: ffmpeg (merge do yt-dlp) + python3 + yt-dlp standalone
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ffmpeg ca-certificates curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências (camada cacheável)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copia o restante do código
COPY . .

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
# Cache dos modelos Whisper dentro do app
ENV XENOVA_CACHE_DIR=/app/.cache

EXPOSE 5050
CMD ["node", "server.js"]
