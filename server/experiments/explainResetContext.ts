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

	for (const run of ["cold", "warm"]) {
		const start = performance.now();
		const result = await getResetContextByIds({
			db,
			customerEntitlementIds,
		});
		const elapsed = performance.now() - start;
		console.log(
			`[hydrate][${run}] rows=${result.customerEntitlements.length}, missing=${result.missingIds.length}, wall-clock=${elapsed.toFixed(0)}ms`,
		);
	}

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
