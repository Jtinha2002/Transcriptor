# CreatorKit — imagem de produção (Render, Hugging Face Spaces, etc.)
# Debian slim (glibc) porque o onnxruntime do Whisper não roda bem em Alpine/musl.
FROM node:20-slim

# Dependências de sistema: ffmpeg (merge do yt-dlp) + python3 + yt-dlp standalone
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ffmpeg ca-certificates curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Usuário não-root (Hugging Face Spaces roda como UID 1000)
RUN useradd -m -u 1000 user

WORKDIR /app

# Instala dependências (camada cacheável)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copia o restante do código e dá posse ao usuário não-root
COPY . .
RUN mkdir -p /app/.cache /app/downloads /app/uploads /app/bin \
    && chown -R user:user /app

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV XENOVA_CACHE_DIR=/app/.cache
# Porta padrão do Hugging Face Spaces (Render injeta sua própria via $PORT)
ENV PORT=7860

USER user
EXPOSE 7860
CMD ["node", "server.js"]
