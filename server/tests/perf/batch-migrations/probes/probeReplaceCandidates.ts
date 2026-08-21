/**
 * EXPLAIN the replace candidate select against leftover bench-plan-replace rows.
 *
 *   bun tests/perf/batch-migrations/probes/probeReplaceCandidates.ts
 */
import { sql } from "drizzle-orm";
import { getBenchContext } from "../utils/benchContext.js";
import { BENCH_PLANREP_PREFIXES } from "../utils/seedBenchPlanItems.js";

const main = async () => {
	const { ctx } = await getBenchContext();
	const { db } = ctx;
	const prefixes = BENCH_PLANREP_PREFIXES;

	const [ids]: Array<{ product: string; entitlement: string }> =
		await db.execute(sql`
			SELECT cp.internal_product_id AS product, ce.entitlement_id AS entitlement
			FROM customer_products cp
			JOIN customer_entitlements ce ON ce.customer_product_id = cp.id
			WHERE cp.id LIKE ${`${prefixes.customerProduct}%`}
			LIMIT 1
		`);

	const pageCustomers = (
		await db.execute<{ internal_id: string }>(sql`
			SELECT internal_id FROM customers
			WHERE internal_id LIKE ${`${prefixes.internalCustomer}%`}
			ORDER BY internal_id
			LIMIT 5000
		`)
	).map((row) => row.internal_id);

	const plan = await db.execute(sql`
		EXPLAIN (ANALYZE, BUFFERS)
		SELECT live.id
		FROM customer_products AS cp
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = cp.id
			AND live.entitlement_id = ${ids.entitlement}
		WHERE cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
			AND cp.internal_product_id = ${ids.product}
			AND cp.status IN ('active', 'past_due', 'scheduled')
			AND cp.customer_license_link_id IS NULL
			AND cp.is_custom = false
		ORDER BY cp.id
		LIMIT 10000
	`);

	console.log("── candidate select ─────────────────────────────────");
	for (const row of plan as Record<string, string>[]) {
		console.log(Object.values(row)[0]);
	}

	const messagesInternalId = ctx.features.find(
		(feature) => feature.id === "messages",
	)?.internal_id;

	const distinct = await db.execute(sql`
		EXPLAIN (ANALYZE, BUFFERS)
		SELECT DISTINCT live.entitlement_id
		FROM customer_products AS cp
		INNER JOIN customer_entitlements AS live
			ON live.customer_product_id = cp.id
			AND live.internal_feature_id = ${messagesInternalId}
		WHERE cp.internal_customer_id = ANY(${sql.param(pageCustomers)}::text[])
			AND cp.internal_product_id = ${ids.product}
			AND cp.status IN ('active', 'past_due', 'scheduled')
			AND cp.customer_license_link_id IS NULL
			AND cp.is_custom = false
		LIMIT 5001
	`);

	console.log("── distinct live entitlements ───────────────────────");
	for (const row of distinct as Record<string, string>[]) {
		console.log(Object.values(row)[0]);
	}

	process.exit(0);
};

await main();
