/** Read-only: list indexes present on migration_item_runs. */
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { assertBenchDatabaseSafe } from "../utils/benchContext.js";

assertBenchDatabaseSafe();
const { db } = initDrizzle();
const rows = (await db.execute(sql`
	SELECT indexname, indexdef FROM pg_indexes
	WHERE tablename = 'migration_item_runs'
`)) as { indexname: string; indexdef: string }[];
for (const row of rows) console.log(`${row.indexname}\n  ${row.indexdef}`);
process.exit(0);
