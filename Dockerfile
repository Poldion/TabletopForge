FROM node:22-alpine

LABEL org.opencontainers.image.title="Tabletop Forge" \
      org.opencontainers.image.description="Self-hosted campaign manager for 5e with a digital game table" \
      org.opencontainers.image.source="https://github.com/Poldion/TabletopForge" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY shared ./shared
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/version > /dev/null || exit 1

CMD ["node", "server/index.js"]
