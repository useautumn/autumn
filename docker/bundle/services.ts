/** A source entrypoint compiled into /app/dist/<name>/index.js. */
export type BundleEntry = { name: string; entrypoint: string };

// leaf is absent on purpose: it builds its embedded eve server from source at boot.
export const BUNDLE_ENTRIES: BundleEntry[] = [
	{ name: "server", entrypoint: "server/src/index.ts" },
	{ name: "workers", entrypoint: "server/src/workers.ts" },
	{ name: "cron", entrypoint: "server/src/cron.ts" },
	{ name: "herald", entrypoint: "apps/herald/src/main.ts" },
	{
		name: "balance-workers",
		entrypoint: "apps/balance-worker/scripts/runWithCpuProfile.ts",
	},
	{
		name: "balance-worker-main",
		entrypoint: "apps/balance-worker/src/main.ts",
	},
];

/** `bun <script>` commands Flightcontrol runs from /app/server, mirroring server/package.json. */
export const SERVICE_SCRIPTS: Record<string, string> = {
	start: "bun $BUN_PROF_FLAGS ../dist/server/index.js",
	workers: "bun $BUN_PROF_FLAGS ../dist/workers/index.js",
	cron: "bun ../dist/cron/index.js",
	herald:
		"bun --cwd=../apps/herald --config=./bunfig.toml ../../dist/herald/index.js",
	"balance-workers":
		"BALANCE_WORKER_MAIN_ENTRY=/app/dist/balance-worker-main/index.js bun --cwd=../apps/balance-worker --config=./bunfig.toml ../../dist/balance-workers/index.js",
};

/** The bunfig files those commands pass via --config; both hold only [test] settings. */
export const RUNTIME_BUNFIGS = [
	"apps/herald/bunfig.toml",
	"apps/balance-worker/bunfig.toml",
];
