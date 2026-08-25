// One-off manual refresh of the TRANSIENT lake_cache_v2 balance tables.
// Must run from the branch/commit where DEFAULT_DATABASE = "lake_cache_v2"
// (feat/lake-cache-v2-transient or later) — the deployed cron keeps writing
// v1 until that code ships, so this seeds v2 ahead of the reader flip.
// Requires MOTHERDUCK_RW_TOKEN and AWS creds with glue:GetTable.
//   infisical run --env=prod --recursive -- bun run server/experiments/refreshV2CacheOnce.ts
import type { Logger } from "../src/external/logtail/logtailUtils";
import { refreshCeBalancesCache } from "../src/external/motherduck/refreshCeBalancesCache";

// Console-backed logger: the pino/logtail logger buffers asynchronously and
// process.exit() drops its output, which made failures here silent.
const consoleLogger = {
	info: (...args: unknown[]) => console.log("[info]", ...args),
	warn: (...args: unknown[]) => console.warn("[warn]", ...args),
	error: (...args: unknown[]) => console.error("[error]", ...args),
	debug: (...args: unknown[]) => console.log("[debug]", ...args),
	trace: (...args: unknown[]) => console.log("[trace]", ...args),
} as unknown as Logger;

console.log("Refreshing lake_cache_v2 balance tables...");
const startedAt = performance.now();
await refreshCeBalancesCache({ logger: consoleLogger });
console.log(`Done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
process.exit(0);
