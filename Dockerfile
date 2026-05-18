# syntax=docker/dockerfile:1.7

# Use the official Playwright image — it ships Chromium and all required
# system libraries pinned to the Playwright version. Keep this tag in sync
# with the `playwright` version in package.json.
ARG PLAYWRIGHT_VERSION=v1.59.1-jammy

FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION} AS base
ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Skip the postinstall `playwright install chromium` — the base image already
# has the matching browser. Saves a few hundred MB and a long download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------- build ----------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts .swcrc ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm db:generate \
 && pnpm build \
 && pnpm prune --prod --ignore-scripts

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=8003 \
    PLAYWRIGHT_HEADLESS=true

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/.reports /app/.auth

EXPOSE 8003
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
