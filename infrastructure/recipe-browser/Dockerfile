FROM node:24.22.1-bookworm-slim
ARG REVISION=development
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/opt/chromium XDG_CONFIG_HOME=/tmp/config XDG_CACHE_HOME=/tmp/cache
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npx playwright-core install --with-deps chromium \
    && apt-get update && apt-get install -y --no-install-recommends xvfb xauth \
    && rm -rf /var/lib/apt/lists/* /root/.npm
COPY . .
USER node
EXPOSE 8090
CMD ["xvfb-run", "-a", "-s", "-screen 0 1280x900x24 -nolisten tcp", "node", "server.mjs"]
