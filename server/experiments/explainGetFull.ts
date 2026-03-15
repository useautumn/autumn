import { AppEnv, CusProductStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestOrgId,
} from "./experimentEnv";
const { getFullCusQuery } = await import(
	"../src/internal/customers/getFullCusQuery"
);

const RELEVANT_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
];

// Run with `bun run experiments/explainGetFull.ts`

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;
	const customerId = prodTestCustomerId;

	const { db } = initDrizzle();

	const query = getFullCusQuery(
		customerId,
		orgId,
		env,
		RELEVANT_STATUSES,
		true, // includeInvoices
		true, // withEntities
		false, // withTrialsUsed
		true, // withSubs
		false, // withEvents
	);

	// Run the actual query to measure wall-clock time
	console.log("--- Running query ---");
	const start = performance.now();
	const result = await db.execute(query);
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms\n`);

	// Run EXPLAIN ANALYZE
	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainQuery = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`;
	const explainResult = await db.execute(explainQuery);

	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		console.log(line);
	}

	process.exit(0);
};

await main();
