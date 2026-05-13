FROM oven/bun:1.3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    file \
    libmagic1 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY src ./src
EXPOSE 8080
CMD ["bun", "run", "src/server.ts"]
