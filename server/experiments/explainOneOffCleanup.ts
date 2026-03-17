import {
	AllowanceType,
	BillingInterval,
	CusProductStatus,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "./experimentEnv";

// Run with `bun run experiments/explainOneOffCleanup.ts`
// Source: getOneOffCustomerProductsToCleanup
// File: server/src/internal/customers/cusProducts/actions/cleanupOneOff/getOneOffToCleanup.ts:48

const RELEVANT_TABLES = [
	"customer_products",
	"customer_prices",
	"customer_entitlements",
	"entitlements",
	"features",
	"prices",
	"products",
	"customers",
	"organizations",
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
	const { db } = initDrizzle();

	await listIndexes({ db });

	const rawQuery = sql`
		WITH 
		active_cus_products_with_prices AS (
			SELECT DISTINCT cp.id
			FROM customer_products cp
			WHERE cp.status IN (${CusProductStatus.Active}, ${CusProductStatus.PastDue})
			  AND EXISTS (
				SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id
			)
		),
		
		cus_products_with_non_one_off_prices AS (
			SELECT DISTINCT cpr.customer_product_id
			FROM customer_prices cpr
			INNER JOIN prices p ON p.id = cpr.price_id
			WHERE cpr.customer_product_id IN (SELECT id FROM active_cus_products_with_prices)
			  AND COALESCE(p.config->>'interval', '') != ${BillingInterval.OneOff}
		),
		
		one_off_cus_products AS (
			SELECT id FROM active_cus_products_with_prices
			WHERE id NOT IN (SELECT customer_product_id FROM cus_products_with_non_one_off_prices)
		),
		
		cus_products_with_entitlements AS (
			SELECT DISTINCT cp.id
			FROM customer_products cp
			WHERE cp.id IN (SELECT id FROM one_off_cus_products)
			  AND EXISTS (
				SELECT 1 FROM customer_entitlements ce WHERE ce.customer_product_id = cp.id
			)
		),
		
		valid_one_off_cus_products AS (
			SELECT cp.id, cp.internal_customer_id, cp.internal_entity_id, cp.created_at, cp.internal_product_id
			FROM customer_products cp
			WHERE cp.id IN (SELECT id FROM cus_products_with_entitlements)
			  AND NOT EXISTS (
			  	SELECT 1
			  	FROM customer_entitlements ce
			  	INNER JOIN entitlements e ON e.id = ce.entitlement_id
			  	INNER JOIN features f ON f.internal_id = e.internal_feature_id
			  	WHERE ce.customer_product_id = cp.id
			  	  AND f.type != ${FeatureType.Boolean}
			  	  AND NOT (
			  	  	COALESCE(f.config->>'usage_type', '') = ${FeatureUsageType.Single}
			  	  	AND COALESCE(e.allowance_type, '') = ${AllowanceType.Fixed}
			  	  	AND COALESCE(ce.balance, 0) = 0
			  	  	AND ce.usage_allowed = false
			  	  )
			  )
		),
		
		cus_products_with_newer_active_product AS (
			SELECT DISTINCT oo.id
			FROM valid_one_off_cus_products oo
			INNER JOIN products prod1 ON prod1.internal_id = oo.internal_product_id
			WHERE EXISTS (
				SELECT 1 
				FROM customer_products cp2
				INNER JOIN products prod2 ON prod2.internal_id = cp2.internal_product_id
				WHERE cp2.internal_customer_id = oo.internal_customer_id
				  AND (
				  	(cp2.internal_entity_id IS NULL AND oo.internal_entity_id IS NULL)
				  	OR cp2.internal_entity_id = oo.internal_entity_id
				  )
				  AND prod2.id = prod1.id
				  AND cp2.created_at > oo.created_at
				  AND cp2.status IN (${CusProductStatus.Active}, ${CusProductStatus.PastDue})
				  AND cp2.id != oo.id
				  AND NOT EXISTS (
				  	SELECT 1
				  	FROM customer_entitlements ce1
				  	INNER JOIN entitlements e1 ON e1.id = ce1.entitlement_id
				  	INNER JOIN features f1 ON f1.internal_id = e1.internal_feature_id
				  	WHERE ce1.customer_product_id = oo.id
				  	  AND f1.type = ${FeatureType.Boolean}
				  	  AND NOT EXISTS (
				  	  	SELECT 1
				  	  	FROM customer_entitlements ce2
				  	  	INNER JOIN entitlements e2 ON e2.id = ce2.entitlement_id
				  	  	INNER JOIN features f2 ON f2.internal_id = e2.internal_feature_id
				  	  	WHERE ce2.customer_product_id = cp2.id
				  	  	  AND f2.id = f1.id
				  	  	  AND f2.type = ${FeatureType.Boolean}
				  	  )
				  )
			)
		)
		
		SELECT 
			row_to_json(cp.*) as customer_product,
			row_to_json(cpr.*) as customer_price,
			row_to_json(p.*) as price,
			row_to_json(c.*) as customer,
			row_to_json(prod.*) as product,
			row_to_json(o.*) as org
		FROM customer_products cp
		INNER JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
		INNER JOIN prices p ON p.id = cpr.price_id
		INNER JOIN customers c ON c.internal_id = cp.internal_customer_id
		INNER JOIN products prod ON prod.internal_id = cp.internal_product_id
		INNER JOIN organizations o ON o.id = c.org_id
		WHERE cp.id IN (SELECT id FROM cus_products_with_newer_active_product)
	`;

	// Run the actual query to measure wall-clock time
	console.log("--- Running getOneOffCustomerProductsToCleanup query ---");
	const start = performance.now();
	const result = await db.execute(rawQuery);
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms\n`);

	// Run EXPLAIN ANALYZE
	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainQuery = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${rawQuery}`;
	const explainResult = await db.execute(explainQuery);

	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		console.log(line);
	}

	process.exit(0);
};

await main();
