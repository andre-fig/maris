FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @maris/api...

COPY apps/api apps/api
RUN pnpm --filter @maris/api build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin gettext-base nginx unzip python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default
ENV NODE_ENV=production
COPY apps/api/scripts/requirements-pmtiles.txt /tmp/requirements-pmtiles.txt
RUN python3 -m venv /opt/pmtiles && /opt/pmtiles/bin/pip install --no-cache-dir -r /tmp/requirements-pmtiles.txt
ENV PMTILES_PYTHON=/opt/pmtiles/bin/python

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY apps/api/package.json apps/api/package.json
COPY apps/api/scripts apps/api/scripts
COPY apps/api/src/charts/models/chart-selection.ts apps/api/src/charts/models/chart-selection.ts
COPY ops/nginx/default.conf.template /etc/nginx/templates/maris.conf.template
COPY ops/docker-entrypoint.sh /usr/local/bin/maris-entrypoint
RUN chmod +x /usr/local/bin/maris-entrypoint

CMD ["maris-entrypoint"]
