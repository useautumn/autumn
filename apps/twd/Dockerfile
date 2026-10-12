# twd needs the monorepo: it imports scripts/tw and resolves server/tests at each run's sha.
FROM oven/bun:1.3.14

# pg_dump/pg_restore 18 copy an expiring Capy branch into a QA branch (Neon runs Postgres 18).
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates curl \
	&& install -d /usr/share/postgresql-common/pgdg \
	&& curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
	&& echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" >/etc/apt/sources.list.d/pgdg.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends postgresql-client-18 \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .
RUN bun install --ignore-scripts && cd apps/twd && bun run web:build

ENV NODE_ENV=production \
	TWD_CACHE_DIR=/data/twd-cache \
	TW_GIT_URL=https://github.com/useautumn/autumn

WORKDIR /repo/apps/twd
CMD ["bun", "src/main.ts"]
