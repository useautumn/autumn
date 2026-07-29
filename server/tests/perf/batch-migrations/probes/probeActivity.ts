/** Read-only: show active queries + waits on the bench DB. */
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { assertBenchDatabaseSafe } from "../utils/benchContext.js";

assertBenchDatabaseSafe();
const { db } = initDrizzle();
const rows = (await db.execute(sql`
	SELECT pid, state, wait_event_type, wait_event,
		NOW() - query_start AS running_for, LEFT(query, 140) AS query
	FROM pg_stat_activity
	WHERE state <> 'idle' AND pid <> pg_backend_pid()
	ORDER BY query_start
`)) as Record<string, unknown>[];
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
