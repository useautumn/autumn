import "dotenv/config";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");

// Diagnoses why the reset scan stopped using idx_customer_entitlements_reset_scan.
//   PW_MODE=1 infisical run --env=prod --recursive -- bun run experiments/checkResetIndex.ts

const main = async () => {
	const { db } = initDrizzle();
	console.log(`DB target: ${new URL(process.env.DATABASE_URL ?? "").host}\n`);

	console.log("--- indexes on customer_entitlements ---");
	const idx = await db.execute(sql`
		SELECT c.relname AS index_name,
		       i.indisvalid,
		       i.indisready,
		       pg_size_pretty(pg_relation_size(c.oid)) AS size,
		       pg_get_indexdef(i.indexrelid) AS def
		FROM pg_index i
		JOIN pg_class c ON c.oid = i.indexrelid
		WHERE i.indrelid = 'customer_entitlements'::regclass
		ORDER BY c.relname
	`);
	for (const row of idx as unknown as Record<string, unknown>[]) {
		console.log(
			`\n${row.index_name}  valid=${row.indisvalid} ready=${row.indisready} size=${row.size}`,
		);
		console.log(`  ${row.def}`);
	}

	console.log("\n--- table stats ---");
	const stats = await db.execute(sql`
		SELECT c.reltuples::bigint AS reltuples,
		       pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
		       s.last_analyze, s.last_autoanalyze, s.last_vacuum, s.last_autovacuum,
		       s.n_live_tup, s.n_dead_tup, s.n_mod_since_analyze
		FROM pg_class c
		LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
		WHERE c.oid = 'customer_entitlements'::regclass
	`);
	console.log(stats);

	console.log("\n--- selectivity of each predicate leg ---");
	const sel = await db.execute(sql`
		SELECT count(*) AS total,
		       count(*) FILTER (WHERE expired IS NOT TRUE) AS not_expired,
		       count(*) FILTER (WHERE reset_by_invoice IS NOT TRUE) AS not_reset_by_invoice,
		       count(*) FILTER (WHERE pooled_contribution_id IS NULL) AS not_pooled,
		       count(*) FILTER (WHERE next_reset_at IS NOT NULL) AS has_next_reset,
		       count(*) FILTER (WHERE expired IS NOT TRUE AND reset_by_invoice IS NOT TRUE AND next_reset_at IS NOT NULL) AS index_predicate_rows
		FROM customer_entitlements
	`);
	console.log(sel);

	const dueBefore = Date.now();

	console.log("\n--- plan WITHOUT the pooled_contribution_id leg (yesterday's query) ---");
	const before = await db.execute(sql`
		EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
		SELECT id, next_reset_at FROM customer_entitlements
		WHERE next_reset_at < ${dueBefore}
		  AND expired IS NOT TRUE
		  AND reset_by_invoice IS NOT TRUE
		  AND (expires_at IS NULL OR expires_at > ${dueBefore})
		ORDER BY next_reset_at, id COLLATE "C"
		LIMIT 10000
	`);
	for (const row of before as unknown as Record<string, unknown>[]) {
		console.log(row["QUERY PLAN"]);
	}

	console.log("\n--- plan WITH pooled leg, other indexes disabled ---");
	await db.execute(sql`SET enable_seqscan = off`);
	await db.execute(
		sql`SET LOCAL enable_indexscan = on`,
	);
	const forced = await db.execute(sql`
		EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
		SELECT id, next_reset_at FROM customer_entitlements
		WHERE next_reset_at < ${dueBefore}
		  AND expired IS NOT TRUE
		  AND reset_by_invoice IS NOT TRUE
		  AND pooled_contribution_id IS NULL
		  AND (expires_at IS NULL OR expires_at > ${dueBefore})
		ORDER BY next_reset_at, id COLLATE "C"
		LIMIT 10000
	`);
	for (const row of forced as unknown as Record<string, unknown>[]) {
		console.log(row["QUERY PLAN"]);
	}

	process.exit(0);
};

await main();
