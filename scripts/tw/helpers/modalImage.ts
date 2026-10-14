import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { App, Image, ModalClient } from "modal";
import { resolveBakedPlaywrightVersion } from "./playwrightVersion.ts";

const BUN_VERSION = readFileSync(
	join(import.meta.dir, "../../../.bun-version"),
	"utf8",
).trim();

export const buildIngressImage = (
	modal: ModalClient,
	app: App,
): Promise<Image> =>
	modal.images
		.fromRegistry("oven/bun:1")
		.dockerfileCommands([
			"RUN apt-get update && apt-get install -y --no-install-recommends " +
				"git ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /repo",
		])
		.build(app);

export type BaseImageDeps = {
	gitUrl: string;
	gitRef: string;
	lockHash: string;
};

const DRAGONFLY_URL =
	"https://dragonflydb.gateway.scarf.sh/latest/dragonfly-x86_64.tar.gz";
const CRANE_URL =
	"https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_x86_64.tar.gz";
const GOAWS_IMAGE = "admiralpiett/goaws:latest";
const DYNOXIDE_URL =
	"https://github.com/nubo-db/dynoxide/releases/download/v0.13.0/dynoxide-x86_64-unknown-linux-musl.tar.gz";
/** The balance worker's log. Redpanda can't run here: Seastar aborts under gVisor (no
 * /proc/sys/fs/aio-max-nr). Google's mirror: Docker Hub rate-limits Modal's builders. */
const KAFKA_NATIVE_IMAGE = "mirror.gcr.io/apache/kafka-native:4.1.0";
const FAKECLOUD_IMAGE =
	"ghcr.io/faiscadev/fakecloud:0.45.0@sha256:78844f091be86081d3d11b056e3d56e6ea0ace4ce607e55fa4255fc759d39279";

const TW_PREFIX = "/opt/autumn-tw";

export const buildBaseImage = (
	modal: ModalClient,
	app: App,
	deps: BaseImageDeps,
): Promise<Image> => {
	const playwrightVersion = resolveBakedPlaywrightVersion();
	return modal.images
		.fromRegistry("debian:bookworm-slim")
		.dockerfileCommands([
			"RUN apt-get update && apt-get install -y --no-install-recommends " +
				"ca-certificates curl wget gnupg bash git xz-utils procps tar gzip " +
				"locales unzip redis-tools python3 make g++ && " +
				"rm -rf /var/lib/apt/lists/* && mkdir -p /repo",
		])
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
		.dockerfileCommands([
			`RUN curl -fsSL -o /tmp/df.tar.gz "${DRAGONFLY_URL}" && ` +
				"tar -xzf /tmp/df.tar.gz -C /tmp && mkdir -p " +
				`${TW_PREFIX}/bin && ` +
				"install -m0755 \"$(find /tmp -type f -name 'dragonfly*' ! -name '*.tar.gz' | head -1)\" " +
				`${TW_PREFIX}/bin/dragonfly && rm -f /tmp/df.tar.gz`,
		])
		.dockerfileCommands([
			`RUN curl -fsSL -o /tmp/crane.tgz "${CRANE_URL}" && ` +
				"tar -xzf /tmp/crane.tgz -C /usr/local/bin crane && rm /tmp/crane.tgz && " +
				`crane export ${GOAWS_IMAGE} /tmp/g.tar && ` +
				"BIN=$(tar -tf /tmp/g.tar | grep -iE '(^|/)goaws$' | head -1) && " +
				`tar -xf /tmp/g.tar -C / "$BIN" && cp "/$BIN" ${TW_PREFIX}/bin/goaws && ` +
				`chmod +x ${TW_PREFIX}/bin/goaws && rm /tmp/g.tar`,
		])
		.dockerfileCommands([
			`RUN curl -fsSL -o /tmp/dx.tar.gz "${DYNOXIDE_URL}" && ` +
				"tar -xzf /tmp/dx.tar.gz -C /tmp && " +
				"install -m0755 \"$(find /tmp -type f -name 'dynoxide*' ! -name '*.tar.gz' | head -1)\" " +
				`${TW_PREFIX}/bin/dynoxide && rm -f /tmp/dx.tar.gz`,
		])
		.dockerfileCommands([
			`RUN crane export ${KAFKA_NATIVE_IMAGE} /tmp/k.tar && mkdir -p /tmp/kn && ` +
				"tar -xf /tmp/k.tar -C /tmp/kn opt/kafka etc/kafka/docker && rm /tmp/k.tar && " +
				"mkdir -p /opt/kafka && mv /tmp/kn/opt/kafka/kafka.Kafka /opt/kafka/ && " +
				"mv /tmp/kn/etc/kafka/docker /opt/kafka/docker && rm -rf /tmp/kn && " +
				"test -x /opt/kafka/kafka.Kafka",
		])
		.dockerfileCommands([
			`RUN mkdir -p ${TW_PREFIX}/goaws ${TW_PREFIX}/logs ${TW_PREFIX}/dragonfly && ` +
				"printf '%s\\n' 'Local:' '  Host: localhost' '  Scheme: http' " +
				"'  Port: 9324' '  Region: us-east-1' '  AccountId: \"000000000000\"' " +
				"'  LogToFile: false' '  LogLevel: warn' '  EnableDuplicates: true' " +
				"'  Queues:' '    - Name: autumn.fifo' '    - Name: autumn-track.fifo' " +
				"'    - Name: autumn-track-async' '    - Name: autumn-stripe-webhook.fifo' " +
				`> ${TW_PREFIX}/goaws/goaws.yaml`,
		])
		.dockerfileCommands([
			`RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && ` +
				"ln -sf /root/.bun/bin/bun /usr/local/bin/bun && " +
				"ln -sf /root/.bun/bin/bun /usr/local/bin/node && bun --version",
		])
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
		.dockerfileCommands([
			`# node_modules bake — lockfile ${deps.lockHash}\n` +
				"RUN export PATH=/usr/local/bin:$PATH && rm -rf /tmp/seed && " +
				`git clone --depth 1 ${deps.gitUrl} /tmp/seed && ` +
				`( cd /tmp/seed && git fetch --depth 1 origin ${deps.gitRef} && git checkout -q FETCH_HEAD ) && ` +
				"( cd /tmp/seed && bun install --frozen-lockfile ) && " +
				"mkdir -p /repo && rm -rf /repo/node_modules && " +
				"mv /tmp/seed/node_modules /repo/node_modules && rm -rf /tmp/seed",
		])
		.dockerfileCommands([
			`# chromium bake — playwright ${playwrightVersion}\n` +
				"RUN export PATH=/root/.bun/bin:/usr/local/bin:$PATH && cd /repo && " +
				"apt-get update && " +
				`bun x playwright@${playwrightVersion} install --with-deps chromium && ` +
				"rm -rf /var/lib/apt/lists/* && " +
				'test -x "$(ls -d /root/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | head -1)"',
		])
		.dockerfileCommands([
			`RUN crane export ${FAKECLOUD_IMAGE} /tmp/fc.tar && ` +
				"tar -xf /tmp/fc.tar -C /tmp usr/local/bin/fakecloud && " +
				`install -m0755 /tmp/usr/local/bin/fakecloud ${TW_PREFIX}/bin/fakecloud && ` +
				`rm -rf /tmp/fc.tar /tmp/usr && ${TW_PREFIX}/bin/fakecloud --help >/dev/null`,
		])
		.build(app);
};
