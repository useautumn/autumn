import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestEntityId,
	prodTestOrgId,
} from "./experimentEnv";

const { getFullSubjectQuery } = await import(
	"../src/internal/customers/repos/getFullSubject/getFullSubjectQuery"
);
const { RELEVANT_STATUSES } = await import(
	"../src/internal/customers/cusProducts/CusProductService"
);

// Run with:
//   bun run experiments/explainGetFullSubject.ts
// Or scoped to an entity:
//   PROD_TEST_ENTITY_ID=... bun run experiments/explainGetFullSubject.ts

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;
	const customerId = prodTestCustomerId;
	const entityId = prodTestEntityId;

	const { db } = initDrizzle();

	const query = getFullSubjectQuery({
		orgId,
		env,
		customerId,
		entityId,
		inStatuses: RELEVANT_STATUSES,
	});

	console.log(
		`--- Running full subject query (customer=${customerId}${entityId ? `, entity=${entityId}` : ""}) ---`,
	);
	const start = performance.now();
	const result = await db.execute(query);
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms`);
	console.log("Result:", JSON.stringify(result, null, 2));
	console.log();

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
