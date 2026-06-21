/**
 * Modal base services image for the `bun tw` swarm (provider=modal).
 *
 * This is the Modal analogue of `image/build-base.sh` (which targets the Vercel
 * µVM's Amazon Linux 2023 + dnf and CANNOT run on Modal's Debian base). It
 * reproduces build-base.sh's EXACT runtime layout so the distro-agnostic
 * `start-services.sh` / `stop-services.sh` / `warmup.sh` run unchanged on top:
 *
 *   - PostgreSQL 18 + contrib (pg_trgm) at /usr/lib/postgresql/18/bin
 *   - PGDATA initdb'd at /opt/autumn-tw/pgdata (port 5432, fsync off, socket /tmp),
 *     db `autumn` created with `CREATE EXTENSION pg_trgm` on an EMPTY schema
 *   - Dragonfly  → /opt/autumn-tw/bin/dragonfly
 *   - goaws (native Go SQS, via crane) → /opt/autumn-tw/bin/goaws
 *   - goaws config → /opt/autumn-tw/goaws/goaws.yaml (port 9324, AccountId
 *     "000000000000", EnableDuplicates env-level, queues autumn.fifo + autumn-track.fifo)
 *   - bun → /usr/local/bin/bun ; node (Debian) for the ingress script
 *
 * What's NOT baked here (done per-run by warmup.sh on Modal, since the repo isn't
 * present at image-build time): `bun install`, `bun db migrate`, the seed, and
 * Playwright Chromium (browser-test groups). The empty migrated db + trgm
 * extension match build-base.sh; warmup.sh layers the ref's schema + seed on top.
 *
 * The build is content-addressed by these commands, so only the FIRST run pays
 * the ~90s build; subsequent runs hit Modal's image cache (~1s).
 *
 * Modal sandboxes run as ROOT (PG refuses to run as root); PGDATA + logs are
 * chowned to `postgres` here and the service scripts run `pg_ctl` via
 * `runuser -u postgres` when EUID=0 (a no-op on the non-root Vercel µVM).
 */
import type { App, Image, ModalClient } from "modal";

/** Inputs for baking node_modules into the base image (see buildBaseImage). */
export type BaseImageDeps = {
	/** Clone URL (may embed a token for a private repo — see the bake step note). */
	gitUrl: string;
	/** Ref whose lockfile/deps to install (branch name or sha). */
	gitRef: string;
	/** Hash of the local lockfile — cache-busts the bake when deps change. */
	lockHash: string;
};

const DRAGONFLY_URL =
	"https://dragonflydb.gateway.scarf.sh/latest/dragonfly-x86_64.tar.gz";
const CRANE_URL =
	"https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_x86_64.tar.gz";
const GOAWS_IMAGE = "admiralpiett/goaws:latest";

/** Fixed layout — must match build-base.sh / start-services.sh exactly. */
const TW_PREFIX = "/opt/autumn-tw";

/**
 * Build (or cache-hit) the published Debian services image. Idempotent: Modal
 * content-addresses the dockerfile commands, so repeat calls are ~free.
 *
 * `deps` bakes the monorepo's node_modules into the image as a base layer. This
 * is load-bearing for speed: node_modules (~5 GB / ~350k files) must NOT be
 * captured per-run by snapshotFilesystem (minutes) and must NOT be read over a
 * network Volume at boot (every `bun` import = a slow small-file read → ~2.5 min
 * server boot). A base image layer is the only place that is BOTH local-fast to
 * read AND excluded from the snapshot diff. warmup.sh's `--frozen-lockfile`
 * install then reconciles the small delta for the exact ref.
 */
export const buildBaseImage = (
	modal: ModalClient,
	app: App,
	deps: BaseImageDeps,
): Promise<Image> =>
	modal.images
		.fromRegistry("debian:bookworm-slim")
		// 1. Base system packages (+ redis-tools for redis-cli, nodejs for ingress).
		//    Pre-create /repo so the sandbox's default workdir exists before the
		//    warm parent's clone runs (execing in a missing cwd is a git-128 error).
		.dockerfileCommands([
			"RUN apt-get update && apt-get install -y --no-install-recommends " +
				"ca-certificates curl wget gnupg bash git xz-utils procps tar gzip " +
				"locales unzip redis-tools nodejs && rm -rf /var/lib/apt/lists/* && " +
				"mkdir -p /repo",
		])
		// 2. PostgreSQL 18 + contrib (pg_trgm) from the PGDG apt repo.
		.dockerfileCommands([
			"RUN install -d /usr/share/postgresql-common/pgdg && " +
				"curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc " +
				"-o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc && " +
				'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] ' +
				'https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" ' +
				"> /etc/apt/sources.list.d/pgdg.list && " +
				"apt-get update && apt-get install -y --no-install-recommends " +
				"postgresql-18 postgresql-contrib-18 && rm -rf /var/lib/apt/lists/*",
		])
		// 3. Dragonfly → $BIN_DIR/dragonfly (matches start-services.sh probe path).
		.dockerfileCommands([
			`RUN curl -fsSL -o /tmp/df.tar.gz "${DRAGONFLY_URL}" && ` +
				"tar -xzf /tmp/df.tar.gz -C /tmp && mkdir -p " +
				`${TW_PREFIX}/bin && ` +
				"install -m0755 \"$(find /tmp -type f -name 'dragonfly*' ! -name '*.tar.gz' | head -1)\" " +
				`${TW_PREFIX}/bin/dragonfly && rm -f /tmp/df.tar.gz`,
		])
		// 4. goaws (native Go SQS) extracted from its OCI image via crane (no daemon).
		.dockerfileCommands([
			`RUN curl -fsSL -o /tmp/crane.tgz "${CRANE_URL}" && ` +
				"tar -xzf /tmp/crane.tgz -C /usr/local/bin crane && rm /tmp/crane.tgz && " +
				`crane export ${GOAWS_IMAGE} /tmp/g.tar && ` +
				"BIN=$(tar -tf /tmp/g.tar | grep -iE '(^|/)goaws$' | head -1) && " +
				`tar -xf /tmp/g.tar -C / "$BIN" && cp "/$BIN" ${TW_PREFIX}/bin/goaws && ` +
				`chmod +x ${TW_PREFIX}/bin/goaws && rm /tmp/g.tar`,
		])
		// 5. goaws config — port 9324 + AccountId "000000000000" + the two FIFO
		//    queues, so the app's SQS_QUEUE_URL_V2 / TRACK_SQS_QUEUE_URL resolve
		//    UNCHANGED. EnableDuplicates is env-level (FIFO dedup on the explicit
		//    MessageDeduplicationId the app always sends).
		.dockerfileCommands([
			`RUN mkdir -p ${TW_PREFIX}/goaws ${TW_PREFIX}/logs ${TW_PREFIX}/dragonfly && ` +
				"printf '%s\\n' 'Local:' '  Host: localhost' '  Scheme: http' " +
				"'  Port: 9324' '  Region: us-east-1' '  AccountId: \"000000000000\"' " +
				"'  LogToFile: false' '  LogLevel: warn' '  EnableDuplicates: true' " +
				"'  Queues:' '    - Name: autumn.fifo' '    - Name: autumn-track.fifo' " +
				`> ${TW_PREFIX}/goaws/goaws.yaml`,
		])
		// 6. bun → /usr/local/bin/bun (so `bun` resolves for warmup / boot / tests).
		.dockerfileCommands([
			"RUN curl -fsSL https://bun.sh/install | bash && " +
				"ln -sf /root/.bun/bin/bun /usr/local/bin/bun && bun --version",
		])
		// 7. initdb the PG18 cluster (as postgres), tune for ephemeral test DBs,
		//    createdb autumn + pg_trgm on an EMPTY schema, then clean-stop. PGDATA +
		//    logs are owned by postgres so the worker's `runuser -u postgres pg_ctl`
		//    can start it (Modal runs sandboxes as root; PG refuses to run as root).
		.dockerfileCommands([
			"RUN export PATH=/usr/lib/postgresql/18/bin:$PATH && " +
				`TW=${TW_PREFIX} && PGDATA=$TW/pgdata && mkdir -p "$PGDATA" && ` +
				'chown -R postgres:postgres "$PGDATA" "$TW/logs" "$TW/dragonfly" && ' +
				'PW=$(mktemp) && printf postgres > "$PW" && chmod 644 "$PW" && ' +
				'runuser -u postgres -- initdb --pgdata="$PGDATA" --username=postgres ' +
				'--auth-local=trust --auth-host=trust --pwfile="$PW" --encoding=UTF8 >/dev/null && ' +
				'rm -f "$PW" && ' +
				"{ echo \"listen_addresses='localhost'\"; echo 'port=5432'; " +
				"echo \"unix_socket_directories='/tmp'\"; echo 'dynamic_shared_memory_type=mmap'; " +
				"echo 'fsync=off'; echo 'synchronous_commit=off'; echo 'full_page_writes=off'; } " +
				'>> "$PGDATA/postgresql.conf" && ' +
				'runuser -u postgres -- pg_ctl -D "$PGDATA" -l "$TW/logs/pg.log" -w -o "-p 5432" start && ' +
				"runuser -u postgres -- createdb -h localhost -p 5432 -U postgres autumn && " +
				"runuser -u postgres -- psql -h localhost -p 5432 -U postgres -d autumn " +
				"-c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;' && " +
				'runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast -w stop',
		])
		// 8. Bake the monorepo's node_modules into the image at /repo/node_modules
		//    (the warm clone + every worker keep it; warmup.sh's --frozen-lockfile
		//    reconciles the exact-ref delta). Clone the ref shallow, install, keep
		//    ONLY node_modules. The `lockHash` comment is part of the (content-
		//    addressed) command, so the bake rebuilds when the lockfile changes.
		//    NOTE: gitUrl may embed a token for a private repo — it lands in this
		//    (workspace-private) image's build history; rotate scoped tokens.
		.dockerfileCommands([
			`# node_modules bake — lockfile ${deps.lockHash}\n` +
				"RUN export PATH=/usr/local/bin:$PATH && rm -rf /tmp/seed && " +
				`git clone --depth 1 ${deps.gitUrl} /tmp/seed && ` +
				`( cd /tmp/seed && git fetch --depth 1 origin ${deps.gitRef} && git checkout -q FETCH_HEAD ) && ` +
				"( cd /tmp/seed && bun install --frozen-lockfile ) && " +
				"mkdir -p /repo && rm -rf /repo/node_modules && " +
				"mv /tmp/seed/node_modules /repo/node_modules && rm -rf /tmp/seed",
		])
		// 9. Playwright Chromium → /root/.cache/ms-playwright (the ~68 browser-driven
		//    test files use the LOCAL Playwright path). Reads playwright-core from the
		//    baked /repo/node_modules; `--with-deps` apt-installs the OS libs (refresh
		//    the index first — earlier layers cleared it). Rebuilds whenever the
		//    node_modules layer does (its parent). Uses `bun x` (not `bunx`) — only
		//    `bun` is symlinked onto /usr/local/bin — and puts /root/.bun/bin on PATH.
		.dockerfileCommands([
			"# chromium bake\n" +
				"RUN export PATH=/root/.bun/bin:/usr/local/bin:$PATH && cd /repo && " +
				"PWV=$(node -p \"require('playwright-core/package.json').version\" 2>/dev/null || echo 1.60.0) && " +
				"apt-get update && " +
				"bun x playwright@$PWV install --with-deps chromium && " +
				"rm -rf /var/lib/apt/lists/*",
		])
		.build(app);
