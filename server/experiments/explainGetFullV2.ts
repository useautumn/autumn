import { sql } from "drizzle-orm";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestOrgId,
} from "./experimentEnv";
const { getSubjectCoreQuery } = await import(
	"../src/internal/customers/repos/sql/getSubjectCoreQuery"
);
import { AppEnv } from "@autumn/shared";

// Run with: bun run experiments/explainGetFullV2.ts

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;
	const customerId = prodTestCustomerId;

	const { db } = initDrizzle();

	// Warm up connection pool
	await db.execute(sql`SELECT 1`);

	const query = getSubjectCoreQuery({ customerId, orgId, env });

	console.log("=== V2: getSubjectCoreQuery ===\n");

	const start = performance.now();
	const result = await db.execute(query);
	const elapsed = performance.now() - start;

	const row = result[0] as Record<string, unknown>;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms`);
	console.log(
		`customer_products: ${(row?.customer_products as unknown[])?.length ?? 0}`,
	);
	console.log(
		`customer_entitlements: ${(row?.customer_entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(
		`extra_customer_entitlements: ${(row?.extra_customer_entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(`products: ${(row?.products as unknown[])?.length ?? 0}`);
	console.log(
		`entitlements: ${(row?.entitlements as unknown[])?.length ?? 0}`,
	);
	console.log(`prices: ${(row?.prices as unknown[])?.length ?? 0}`);
	console.log(`rollovers: ${(row?.rollovers as unknown[])?.length ?? 0}`);
	console.log(
		`free_trials: ${(row?.free_trials as unknown[])?.length ?? 0}\n`,
	);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explain = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`;
	const explainResult = await db.execute(explain);
	for (const r of explainResult) {
		console.log((r as Record<string, unknown>)["QUERY PLAN"]);
	}

	process.exit(0);
};

await main();
