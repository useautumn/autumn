import {
	CusProductStatus,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	entitlements,
	features,
	prices,
} from "@autumn/shared";
import { and, eq, gt, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { initDrizzle } from "./experimentEnv";

// Run with `bun run experiments/explainResetCron.ts`
// Source: CusEntitlementService.getActiveResetPassed
// File: server/src/internal/customers/cusProducts/cusEnts/CusEntitlementService.ts:161

const RELEVANT_TABLES = [
	"customer_entitlements",
	"entitlements",
	"features",
	"customers",
	"customer_products",
];

const listIndexes = async ({ db }: { db: ReturnType<typeof initDrizzle>["db"] }) => {
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
	const { db } = initDrizzle({ replica: true });
	const now = Date.now();

	await listIndexes({ db });

	// Reproduce the exact Drizzle query from getActiveResetPassed
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
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.where(
			and(
				or(
					isNull(customerEntitlements.customer_product_id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
				lt(customerEntitlements.next_reset_at, now),
				or(
					isNull(customerEntitlements.expires_at),
					gt(customerEntitlements.expires_at, now),
				),
			),
		)
		.limit(5000);

	// ── Original query ──────────────────────────────────────────────────
	console.log("=== ORIGINAL: getActiveResetPassed (LEFT JOIN + OR) ===\n");
	const startOrig = performance.now();
	const resultOrig = await db.execute(query.getSQL());
	const elapsedOrig = performance.now() - startOrig;
	console.log(`Rows returned: ${resultOrig.length}`);
	console.log(`Wall-clock time: ${elapsedOrig.toFixed(2)}ms\n`);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainOrig = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query.getSQL()}`;
	const explainOrigResult = await db.execute(explainOrig);
	for (const row of explainOrigResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	const expiryFilter = or(
		isNull(customerEntitlements.expires_at),
		gt(customerEntitlements.expires_at, now),
	);

	// ── Optimized Sub-query A: Loose entitlements ───────────────────────
	console.log(
		"\n=== OPTIMIZED A: Loose entitlements (customer_product_id IS NULL) ===\n",
	);
	const looseQuery = db
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
		.where(
			and(
				isNull(customerEntitlements.customer_product_id),
				lt(customerEntitlements.next_reset_at, now),
				expiryFilter,
			),
		)
		.limit(5000);

	const startLoose = performance.now();
	const resultLoose = await db.execute(looseQuery.getSQL());
	const elapsedLoose = performance.now() - startLoose;
	console.log(`Rows returned: ${resultLoose.length}`);
	console.log(`Wall-clock time: ${elapsedLoose.toFixed(2)}ms\n`);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainLoose = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${looseQuery.getSQL()}`;
	const explainLooseResult = await db.execute(explainLoose);
	for (const row of explainLooseResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	// ── Optimized Sub-query B: Active product entitlements ──────────────
	console.log(
		"\n=== OPTIMIZED B: Active product entitlements (INNER JOIN) ===\n",
	);
	const activeQuery = db
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
	.innerJoin(
		customerProducts,
		sql`${customerEntitlements.customer_product_id} COLLATE "C" = ${customerProducts.id}`,
	)
		.where(
			and(
				eq(customerProducts.status, CusProductStatus.Active),
				lt(customerEntitlements.next_reset_at, now),
				expiryFilter,
			),
		)
		.limit(5000);

	const startActive = performance.now();
	const resultActive = await db.execute(activeQuery.getSQL());
	const elapsedActive = performance.now() - startActive;
	console.log(`Rows returned: ${resultActive.length}`);
	console.log(`Wall-clock time: ${elapsedActive.toFixed(2)}ms\n`);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainActive = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${activeQuery.getSQL()}`;
	const explainActiveResult = await db.execute(explainActive);
	for (const row of explainActiveResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	// ── Optimized Sub-query C: Active product + NOT price-backed ───────
	// Mirrors `cusEntToCusPrice` filter applied in `getResettableCustomerEntitlements`
	// at the SQL level: a cusEnt is price-backed when a customer_price exists
	// for the same customer_product whose price.entitlement_id matches the
	// cusEnt's entitlement_id. Such cusEnts MUST NOT be picked up by the reset
	// cron — their reset is owned by the Stripe invoice.created handler.
	console.log(
		"\n=== OPTIMIZED C: Active product + NOT price-backed (NOT EXISTS) ===\n",
	);
	const activeFilteredQuery = db
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
		.innerJoin(
			customerProducts,
			sql`${customerEntitlements.customer_product_id} COLLATE "C" = ${customerProducts.id}`,
		)
		.where(
			and(
				eq(customerProducts.status, CusProductStatus.Active),
				lt(customerEntitlements.next_reset_at, now),
				expiryFilter,
				notExists(
					db
						.select({ one: sql`1` })
						.from(customerPrices)
						.innerJoin(prices, eq(prices.id, customerPrices.price_id))
						.where(
							and(
								sql`${customerPrices.customer_product_id} COLLATE "C" = ${customerEntitlements.customer_product_id}`,
								eq(prices.entitlement_id, customerEntitlements.entitlement_id),
							),
						),
				),
			),
		)
		.limit(5000);

	const startActiveFiltered = performance.now();
	const resultActiveFiltered = await db.execute(activeFilteredQuery.getSQL());
	const elapsedActiveFiltered = performance.now() - startActiveFiltered;
	console.log(`Rows returned: ${resultActiveFiltered.length}`);
	console.log(`Wall-clock time: ${elapsedActiveFiltered.toFixed(2)}ms\n`);

	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainActiveFiltered = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${activeFilteredQuery.getSQL()}`;
	const explainActiveFilteredResult = await db.execute(explainActiveFiltered);
	for (const row of explainActiveFilteredResult) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	// ── Summary ─────────────────────────────────────────────────────────
	console.log("\n=== SUMMARY ===\n");
	console.log(`Original:    ${elapsedOrig.toFixed(2)}ms (${resultOrig.length} rows)`);
	console.log(`Optimized A: ${elapsedLoose.toFixed(2)}ms (${resultLoose.length} rows)`);
	console.log(`Optimized B: ${elapsedActive.toFixed(2)}ms (${resultActive.length} rows)`);
	console.log(
		`Optimized C: ${elapsedActiveFiltered.toFixed(2)}ms (${resultActiveFiltered.length} rows) — with NOT EXISTS price filter`,
	);
	console.log(
		`Optimized total (A + C, the proposed fix): ${(elapsedLoose + elapsedActiveFiltered).toFixed(2)}ms (${resultLoose.length + resultActiveFiltered.length} rows)`,
	);
	console.log(
		`Filter cost (C vs B): ${(elapsedActiveFiltered - elapsedActive).toFixed(2)}ms, rows dropped: ${resultActive.length - resultActiveFiltered.length}`,
	);

	process.exit(0);
};

await main();
