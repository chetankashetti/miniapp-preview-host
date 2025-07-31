FROM node:22-alpine

RUN apk add --no-cache bash git
RUN npm i -g pnpm@9

# Cache dirs
RUN mkdir -p /srv/.pnpm-store /srv/previews
ENV PNPM_STORE_DIR=/srv/.pnpm-store
WORKDIR /srv

# --- Pull boilerplate into the image (fast & deterministic) ---
ARG BOILERPLATE_REPO="https://github.com/earnkitai/minidev-boilerplate.git"
ARG BOILERPLATE_REF="main"   # pin to a commit SHA for reproducible builds
RUN git clone --filter=blob:none --depth=1 -b "$BOILERPLATE_REF" "$BOILERPLATE_REPO" /srv/boilerplate

# Pre-warm pnpm store so runtime installs are near-instant
RUN cd /srv/boilerplate && pnpm fetch

# Orchestrator
COPY orchestrator/ /srv/orchestrator/

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "orchestrator/index.js"]
