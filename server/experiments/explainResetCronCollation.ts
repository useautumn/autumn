import {
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	customers,
	entitlements,
	features,
} from "@autumn/shared";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { initDrizzle } from "./experimentEnv";

// Run with `bun run experiments/explainResetCronCollation.ts`
// Tests the getActiveResetPassed query with COLLATE "C" fix on the LEFT JOIN.

const RELEVANT_TABLES = ["customer_entitlements", "customer_products"];

const listIndexes = async ({
	db,
}: { db: ReturnType<typeof initDrizzle>["db"] }) => {
	console.log("--- Existing indexes on relevant tables ---\n");
	const indexResult = await db.execute<{
		tablename: string;
		indexname: string;
		indexdef: string;
	}>(sql`
		SELECT tablename, indexname, indexdef
		FROM pg_indexes
		WHERE tablename IN (${sql.join(
			RELEVANT_TABLES.map((t) => sql`${t}`),
			sql`, `,
		)})
		ORDER BY tablename, indexname
	`);

	for (const row of indexResult) {
		console.log(`[${row.tablename}] ${row.indexname}`);
		console.log(`  ${row.indexdef}\n`);
	}
};

const main = async () => {
	const { db } = initDrizzle();
	const now = Date.now();

	await listIndexes({ db });

	const expiryFilter = or(
		isNull(customerEntitlements.expires_at),
		gt(customerEntitlements.expires_at, now),
	);

	const query = db
		.select()
		.from(customerEntitlements)
		.innerJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.innerJoin(
			features,
			eq(entitlements.internal_feature_id, features.internal_id),
		)
		.innerJoin(
			customers,
			eq(customerEntitlements.internal_customer_id, customers.internal_id),
		)
		.leftJoin(
			customerProducts,
			sql`${customerEntitlements.customer_product_id} COLLATE "C" = ${customerProducts.id}`,
		)
		.where(
			and(
				or(
					isNull(customerEntitlements.customer_product_id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
				lt(customerEntitlements.next_reset_at, now),
				expiryFilter,
			),
		)
		.limit(5000);

	console.log("=== getActiveResetPassed + COLLATE fix ===\n");
	const start = performance.now();
	const result = await db.execute(query.getSQL());
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms\n`);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query.getSQL()}`,
	);
	for (const row of explainResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	process.exit(0);
};

await main();
