/**
 * Prints the longest-running active statements — use it against a bench run in
 * another shell to catch whichever query is hanging.
 *
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probeActiveQueries.ts
 */
import { Client } from "pg";

const MIN_DURATION = "2 seconds";

const main = async () => {
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	const result = await client.query<{ dur: string; q: string }>(
		`SELECT (now() - query_start)::text AS dur, left(query, 2000) AS q
		 FROM pg_stat_activity
		 WHERE state = 'active'
		   AND now() - query_start > interval '${MIN_DURATION}'
		   AND query NOT ILIKE '%pg_stat_activity%'
		 ORDER BY now() - query_start DESC
		 LIMIT 3`,
	);

	if (result.rows.length === 0) console.log("probe: nothing running > 2s");
	for (const row of result.rows) {
		console.log(`\n── running for ${row.dur} ──────────────────────────`);
		console.log(row.q.replace(/[\n\t]+/g, " ").replace(/ {2,}/g, " "));
	}

	await client.end();
	process.exit(0);
};

await main();
