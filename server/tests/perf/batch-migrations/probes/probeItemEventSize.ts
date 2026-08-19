/**
 * Measures the real NDJSON byte size of migration item events from the last
 * Fanout-shape bench run, to size the per-page Tinybird POST.
 *
 * Run: infisical run --env=dev --recursive -- bun server/tests/perf/batch-migrations/probes/probeItemEventSize.ts
 */
import { migrationTinybird } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { getBenchContext } from "../utils/benchContext.js";

const main = async () => {
	if (!migrationTinybird) throw new Error("Tinybird not configured");
	const { ctx, org } = await getBenchContext();

	const result = await migrationTinybird.sql<Record<string, unknown>>(`
		SELECT *
		FROM migration_item_events
		WHERE org_id = '${org.id}' AND env = '${ctx.env}'
		ORDER BY timestamp DESC
		LIMIT 200
		FORMAT JSON
	`);
	const rows = result.data ?? [];
	if (rows.length === 0) throw new Error("no events found");

	// ClickHouse returns nested JSON columns as pretty-printed strings; the
	// ingest wire format is compact. Re-compact to estimate the true POST size.
	const compact = (value: unknown): unknown => {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
				try {
					return compact(JSON.parse(value));
				} catch {
					return value;
				}
			}
			return value;
		}
		if (Array.isArray(value)) return value.map(compact);
		if (value && typeof value === "object")
			return Object.fromEntries(
				Object.entries(value).map(([k, v]) => [k, compact(v)]),
			);
		return value;
	};

	const rawSizes = rows.map((row) => JSON.stringify(row).length);
	const compactSizes = rows.map((row) => JSON.stringify(compact(row)).length);
	const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
	console.log(`events sampled: ${rows.length}`);
	console.log(`avg read-back row bytes (pretty): ${Math.round(avg(rawSizes))}`);
	console.log(`avg compact row bytes (wire): ${Math.round(avg(compactSizes))}`);
	console.log(
		`projected 5,000-row POST: ${((avg(compactSizes) * 5000) / 1024 / 1024).toFixed(1)} MB`,
	);
	console.log(`sample compact row: ${JSON.stringify(compact(rows[0])).slice(0, 800)}`);
};

await main();
process.exit(0);
