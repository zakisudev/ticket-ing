# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

# Copy manifests first so dependency installation remains cacheable when only
# application source changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --include=dev --no-audit --no-fund


FROM dependencies AS build

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

RUN npm run build


FROM node:22-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/zakisudev/ticket-ing" \
      org.opencontainers.image.description="Self-hosted engineering ticket tracker and development memory system"

ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_CACHE=/tmp/.npm

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle apps/api/drizzle
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/zakisu-entrypoint

RUN chmod 0555 /usr/local/bin/zakisu-entrypoint

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["zakisu-entrypoint"]
CMD ["node", "--enable-source-maps", "apps/api/dist/index.js"]

