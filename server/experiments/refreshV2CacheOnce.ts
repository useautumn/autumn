// One-off manual refresh of the TRANSIENT lake_cache_v2 balance tables.
// Requires MOTHERDUCK_RW_TOKEN and AWS creds with glue:GetTable.
//   infisical run --env=prod --recursive -- bun run server/experiments/refreshV2CacheOnce.ts
//
// --shadow writes ce_balance_totals__shadow instead of the live table, so a
// query change can be diffed against production before it ships.
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

const totalsTable = process.argv.includes("--shadow")
	? "ce_balance_totals__shadow"
	: undefined;

console.log(
	`Refreshing lake_cache_v2 balance tables (totals -> ${totalsTable ?? "ce_balance_totals"})...`,
);
const startedAt = performance.now();
const { ok } = await refreshCeBalancesCache({
	logger: consoleLogger,
	totalsTable,
});
if (!ok) {
	console.error("Refresh FAILED — v2 is not seeded; do not merge/deploy.");
	process.exit(1);
}
console.log(`Done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
process.exit(0);
