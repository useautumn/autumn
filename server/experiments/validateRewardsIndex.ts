import "dotenv/config";
import pg from "pg";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

// Validates that idx_rewards_org_id_env (org_id, env) is usable + helpful when
// org_id is SELECTIVE — i.e. the org owns a small fraction of a multi-tenant
// rewards table. The dev DB only has 3 orgs, so we clone the real table
// (LIKE rewards INCLUDING INDEXES → carries the (org_id, env) btree) into a
// throwaway probe table with no FK, populate realistic cardinality, ANALYZE,
// then compare the planner's natural plan vs forced seq-scan vs forced index.
//
//   bun run experiments/validateRewardsIndex.ts
//   PROBE_TOTALS="1000,50000,200000" bun run experiments/validateRewardsIndex.ts

const PROBE = "rewards_idx_probe";
const TARGET_ORG = "org_TARGET";
const TARGET_ROWS = 50; // the org under test: constant; its fraction shrinks as total grows
const REPS = 6;

const TOTALS = (process.env.PROBE_TOTALS ?? "100,1000,10000,50000,200000")
	.split(",")
	.map((n) => Number.parseInt(n.trim(), 10))
	.filter((n) => Number.isFinite(n) && n > 0);

const median = (xs: number[]) =>
	[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const explain = async ({
	client,
	query,
	params,
	settings,
}: {
	client: pg.PoolClient;
	query: string;
	params: unknown[];
	settings: string[];
}) => {
	for (const s of settings) await client.query(s);
	const samples: number[] = [];
	let scan = "?";
	for (let i = 0; i < REPS; i++) {
		const res = await client.query(
			`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
			params,
		);
		const raw = (res.rows[0] as Record<string, unknown>)["QUERY PLAN"];
		const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<{
			Plan: Record<string, unknown>;
			"Execution Time": number;
		}>;
		samples.push(parsed[0]["Execution Time"]);
		const walk = (node: Record<string, unknown>) => {
			if (node["Relation Name"] === PROBE) {
				scan = `${node["Node Type"]}${node["Index Name"] ? ` (${node["Index Name"]})` : ""}`;
			}
			for (const k of (node.Plans as Record<string, unknown>[] | undefined) ?? [])
				walk(k);
		};
		walk(parsed[0].Plan);
	}
	await client.query("RESET ALL");
	return { exec: median(samples), scan };
};

const main = async () => {
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
	const client = await pool.connect();

	await client.query(`DROP TABLE IF EXISTS ${PROBE}`);
	// Clone real rewards table shape + its (org_id, env) index. FKs are NOT
	// copied by LIKE, so we can insert arbitrary fake org_ids.
	await client.query(
		`CREATE TABLE ${PROBE} (LIKE rewards INCLUDING DEFAULTS INCLUDING INDEXES)`,
	);

	const cappedSql = `SELECT internal_id FROM ${PROBE} WHERE org_id = $1 AND env = $2 ORDER BY internal_id DESC LIMIT 100`;
	const unlimitedSql = `SELECT internal_id FROM ${PROBE} WHERE org_id = $1 AND env = $2 ORDER BY internal_id DESC`;
	const params = [TARGET_ORG, "sandbox"];

	const results: Record<string, number | string>[] = [];
	try {
		for (const total of TOTALS) {
			await client.query(`TRUNCATE ${PROBE}`);
			const numOrgs = Math.max(2, Math.floor(total / 20));

			// Background rows spread across many fake orgs.
			await client.query(
				`INSERT INTO ${PROBE} (internal_id, id, org_id, env, type, created_at, discount_config, promo_codes)
				 SELECT 'probe-' || g, 'id-' || g, 'org_' || (g % ${numOrgs}), 'sandbox',
				        'percentage_discount', 1700000000000,
				        '{"discount_value":10,"duration_type":"months","duration_value":3,"apply_to_all":true,"price_ids":[]}'::jsonb,
				        ARRAY['{"code":"X"}'::jsonb]
				 FROM generate_series(1, ${total}) g`,
			);
			// Target org rows.
			await client.query(
				`INSERT INTO ${PROBE} (internal_id, id, org_id, env, type, created_at, discount_config, promo_codes)
				 SELECT 'probe-t-' || g, 'idt-' || g, '${TARGET_ORG}', 'sandbox',
				        'percentage_discount', 1700000000000,
				        '{"discount_value":10,"duration_type":"months","duration_value":3,"apply_to_all":true,"price_ids":[]}'::jsonb,
				        ARRAY['{"code":"X"}'::jsonb]
				 FROM generate_series(1, ${TARGET_ROWS}) g`,
			);
			await client.query(`ANALYZE ${PROBE}`);

			const tableRows = total + TARGET_ROWS;
			const natural = await explain({ client, query: cappedSql, params, settings: [] });
			const forcedSeq = await explain({
				client,
				query: cappedSql,
				params,
				settings: ["SET enable_indexscan = off", "SET enable_bitmapscan = off"],
			});
			const forcedIdx = await explain({
				client,
				query: cappedSql,
				params,
				settings: ["SET enable_seqscan = off"],
			});
			const unlimitedNatural = await explain({
				client,
				query: unlimitedSql,
				params,
				settings: [],
			});

			results.push({
				"table rows": tableRows,
				"target %": +((TARGET_ROWS / tableRows) * 100).toFixed(2),
				"natural plan": natural.scan,
				"natural ms": +natural.exec.toFixed(3),
				"forced seq ms": +forcedSeq.exec.toFixed(3),
				"forced idx ms": +forcedIdx.exec.toFixed(3),
				"speedup (seq/idx)": +(forcedSeq.exec / forcedIdx.exec).toFixed(1),
				"unlimited natural ms": +unlimitedNatural.exec.toFixed(3),
			});
			console.log(
				`rows=${tableRows} (target ${((TARGET_ROWS / tableRows) * 100).toFixed(2)}%): natural=${natural.scan} ${natural.exec.toFixed(2)}ms | seq ${forcedSeq.exec.toFixed(2)}ms | idx ${forcedIdx.exec.toFixed(2)}ms`,
			);
		}
	} finally {
		await client.query(`DROP TABLE IF EXISTS ${PROBE}`);
		client.release();
		console.log("\nDropped probe table.\n");
	}

	console.log(
		`\n=== idx_rewards_org_id_env validation — target org = ${TARGET_ROWS} rows, LIMIT 100 query, median of ${REPS} ===`,
	);
	console.table(results);
	await pool.end();
	process.exit(0);
};

await main();
