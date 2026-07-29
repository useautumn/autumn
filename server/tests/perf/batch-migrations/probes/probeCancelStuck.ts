/** Cancel leftover probe backends, then refresh migration_item_runs stats. */
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { assertBenchDatabaseSafe } from "../utils/benchContext.js";

assertBenchDatabaseSafe();
const { db } = initDrizzle();
const cancelled = (await db.execute(sql`
	SELECT pid, pg_cancel_backend(pid) AS cancelled
	FROM pg_stat_activity
	WHERE state = 'active' AND pid <> pg_backend_pid()
		AND query LIKE '%EXPLAIN (ANALYZE, BUFFERS)%'
`)) as Record<string, unknown>[];
console.log("cancelled:", JSON.stringify(cancelled));

const started = Date.now();
await db.execute(sql`ANALYZE migration_item_runs`);
console.log(`ANALYZE migration_item_runs done in ${Date.now() - started}ms`);
process.exit(0);
