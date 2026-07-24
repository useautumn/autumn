import "dotenv/config";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");
const { getResetEligibleCustomerEntitlementsPage } = await import(
	"../src/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage"
);
const { buildResetContextByIdsQuery, getResetContextByIds } = await import(
	"../src/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds"
);

// Benchmarks the batch reset worker's ID hydration: scans one keyset page,
// then times and explains the same ID-based query the worker runs.
//
// Run with:
//   bun run experiments/explainResetContext.ts
// Options (env vars):
//   RESET_CONTEXT_BATCH_SIZE=1000   number of cusEnt IDs to hydrate

const main = async () => {
	const batchSize = Number(process.env.RESET_CONTEXT_BATCH_SIZE ?? 1000);
	const { db } = initDrizzle();
	const dueBefore = Date.now();

	const page = await getResetEligibleCustomerEntitlementsPage({
		db,
		dueBefore,
		cursor: null,
		limit: batchSize,
	});
	const customerEntitlementIds = page.map((row) => row.id);
	if (customerEntitlementIds.length === 0) {
		console.log("Scanned 0 eligible customer entitlements");
		process.exit(0);
	}
	console.log(`Scanned ${page.length} eligible customer entitlement IDs\n`);

	// Full repo call (query + zod parse), cold then warm.
	for (const run of ["cold", "warm"]) {
		const start = performance.now();
		const result = await getResetContextByIds({
			db,
			customerEntitlementIds,
		});
		const elapsed = performance.now() - start;
		console.log(
			`[hydrate][${run}] rows=${result.customerEntitlements.length}, missing=${result.missingIds.length}, invalid=${result.invalidIds.length}, wall-clock=${elapsed.toFixed(0)}ms`,
		);
		for (const invalid of result.invalidIds.slice(0, 3)) {
			console.log(`  invalid ${invalid.id}: ${invalid.error.slice(0, 200)}`);
		}
	}

	// Query-only timing (no zod parse), to separate DB cost from parse cost.
	{
		const start = performance.now();
		const rows = await db.execute(
			buildResetContextByIdsQuery({ customerEntitlementIds }),
		);
		const elapsed = performance.now() - start;
		console.log(
			`[query-only] rows=${rows.length}, wall-clock=${elapsed.toFixed(0)}ms\n`,
		);
	}

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---");
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${buildResetContextByIdsQuery({ customerEntitlementIds })}`,
	);
	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		if (typeof line === "string") console.log(line);
	}

	process.exit(0);
};

await main();
