# Stage 1 — base: Node 22 Alpine with pnpm
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# Stage 2 — deps: install all workspace dependencies
FROM base AS deps
WORKDIR /workspace

# Copy workspace manifests (root + all packages + all apps)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# packages
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/db/package.json       packages/db/package.json
COPY packages/business/package.json packages/business/package.json

# apps
COPY apps/api-core/package.json       apps/api-core/package.json
COPY apps/bff-aluno/package.json      apps/bff-aluno/package.json
COPY apps/bff-franqueadora/package.json apps/bff-franqueadora/package.json
COPY apps/bff-franquia/package.json   apps/bff-franquia/package.json
COPY apps/bff-hub/package.json        apps/bff-hub/package.json
COPY apps/web-franqueadora/package.json apps/web-franqueadora/package.json
COPY apps/web-franquia/package.json   apps/web-franquia/package.json
COPY apps/web-hub/package.json        apps/web-hub/package.json

RUN pnpm install --frozen-lockfile

# Stage 3 — builder: compile shared, db, business, api-core
FROM base AS builder
WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/packages/shared/node_modules  packages/shared/node_modules
COPY --from=deps /workspace/packages/db/node_modules      packages/db/node_modules
COPY --from=deps /workspace/packages/business/node_modules packages/business/node_modules
COPY --from=deps /workspace/apps/api-core/node_modules    apps/api-core/node_modules

COPY . .

RUN pnpm --filter @washington/shared   build && \
    pnpm --filter @washington/db       build && \
    pnpm --filter @washington/business build && \
    pnpm --filter @washington/api-core build

# Stage 4 — runner: lean production image
FROM node:22-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy compiled output and production node_modules
COPY --from=builder --chown=app:app /workspace/apps/api-core/dist             ./dist
COPY --from=builder --chown=app:app /workspace/apps/api-core/node_modules     ./node_modules
COPY --from=builder --chown=app:app /workspace/packages/shared/dist           ./packages/shared/dist
COPY --from=builder --chown=app:app /workspace/packages/db/dist               ./packages/db/dist
COPY --from=builder --chown=app:app /workspace/packages/business/dist         ./packages/business/dist

USER app

EXPOSE 3400

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3400/healthz || exit 1

CMD ["node", "dist/server.js"]
