FROM imbios/bun-node:latest-current-slim

USER root
RUN (id user || useradd -m -s /bin/bash user)
RUN mkdir -p /home/user/agent && chown user:user /home/user/agent
USER user
WORKDIR /home/user/agent
COPY --chown=user:user sandbox/package.json .
RUN bun install
RUN node node_modules/@anthropic-ai/claude-code/install.cjs
RUN rm -rf node_modules/@anthropic-ai/*-musl
