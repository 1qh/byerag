FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    poppler-utils \
    pandoc \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-vie \
    jq \
    file \
    libmagic1 \
    ca-certificates \
    procps \
    coreutils \
    diffutils \
    grep \
    sed \
    gawk \
    bsdmainutils \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.13 --silent && bun --version
RUN useradd -m -u 1000 -s /bin/bash agent && \
    mkdir -p /workspace /home/agent/.cache && \
    chown -R agent:agent /workspace /home/agent
USER agent
WORKDIR /workspace
ENV NODE_ENV=production \
    BUN_INSTALL=/home/agent/.bun \
    PATH=/home/agent/.bun/bin:/usr/local/bin:/usr/bin:/bin \
    CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES=1
CMD ["bun", "--version"]
