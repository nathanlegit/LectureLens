# Lecture Lens: one long-running Node process serving the API, media and the built web app.
FROM node:24-slim

# ffmpeg for ingest and frames; build tools in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 make g++ curl \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp for YouTube links (a Python zipapp; python3 is installed above). YouTube changes often:
# if imports start failing, bump this to the latest release.
ARG YTDLP_VERSION=2026.08.19
RUN curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# The deployed server never runs whisper.cpp: transcription goes to the hosted API.
ENV NODE_ENV=production \
    DATA_DIR=/data \
    TRANSCRIBER=groq \
    LINK_IMPORT=false

# Node directly, not through npm: npm reports a normal SIGTERM on redeploy as "command failed".
CMD ["node", "--import", "tsx", "server/src/index.ts"]
