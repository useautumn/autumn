import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppEnv, schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

const { CusProdReadService } = await import(
	"../src/internal/customers/cusProducts/CusProdReadService"
);
const { ProductService } = await import(
	"../src/internal/products/ProductService"
);

// Run with:
//   PRODUCT_COUNTS_ORG_ID=org_2x3YWDWucn3OSul12pIV6XrcXyo bun run experiments/explainGetProductCounts.ts

const main = async () => {
	const orgId = process.env.PRODUCT_COUNTS_ORG_ID || prodTestOrgId;
	const env = AppEnv.Live;

	const { db } = initDrizzle();

	console.log(
		`--- Running GET /products/product_counts for org=${orgId} env=${env} ---\n`,
	);

	// Mirror the handler exactly
	const startTotal = performance.now();

	const startListFull = performance.now();
	const products = await ProductService.listFull({ db, orgId, env });
	const elapsedListFull = performance.now() - startListFull;

	console.log(`ProductService.listFull: ${elapsedListFull.toFixed(2)}ms (${products.length} products)\n`);

	const startCounts = performance.now();
	const perProductTimings: { id: string; ms: number }[] = [];
	const counts = await Promise.all(
		products.map(async (product) => {
			const s = performance.now();
			const result = await CusProdReadService.getCountsForAllVersions({
				db,
				productId: product.id,
				orgId,
				env,
			});
			perProductTimings.push({ id: product.id, ms: performance.now() - s });
			return result;
		}),
	);
	const elapsedCounts = performance.now() - startCounts;

	const elapsedTotal = performance.now() - startTotal;

	console.log(`Promise.all over getCountsForAllVersions: ${elapsedCounts.toFixed(2)}ms`);
	console.log(`Total handler logic: ${elapsedTotal.toFixed(2)}ms`);
	console.log(`Counts returned: ${counts.length}\n`);

	console.log("--- Per-product timings (top 10 slowest) ---\n");
	perProductTimings.sort((a, b) => b.ms - a.ms);
	for (const t of perProductTimings.slice(0, 10)) {
		console.log(`  ${t.id}: ${t.ms.toFixed(2)}ms`);
	}
	console.log();

	const sumPerProduct = perProductTimings.reduce((acc, t) => acc + t.ms, 0);
	const avgPerProduct = sumPerProduct / perProductTimings.length;
	console.log(`Avg per-product: ${avgPerProduct.toFixed(2)}ms`);
	console.log(`Sum (serial equivalent): ${sumPerProduct.toFixed(2)}ms\n`);

	// Capture Drizzle SQL for ONE per-product query and EXPLAIN it
	const capturedQueries: { query: string; params: unknown[] }[] = [];
	const pool = new pg.Pool({
		connectionString: process.env.DATABASE_URL,
		max: 2,
	});
	const loggedDb = drizzle(pool, {
		schema: schemas,
		logger: {
			logQuery: (query, params) => capturedQueries.push({ query, params }),
		},
	});

	if (products[0]) {
		console.log(`--- Capturing Drizzle SQL for product ${products[0].id} ---\n`);
		await CusProdReadService.getCountsForAllVersions({
			db: loggedDb as never,
			productId: products[0].id,
			orgId,
			env,
		});

		// Two queries are emitted: products lookup + the aggregate
		for (const [i, q] of capturedQueries.entries()) {
			const isAggregate = q.query.includes("count(distinct");
			console.log(`Query ${i + 1} ${isAggregate ? "(aggregate)" : "(product lookup)"}:`);
			console.log(q.query);
			console.log("Params:", q.params, "\n");

			console.log(`--- EXPLAIN (ANALYZE, BUFFERS) ---\n`);
			const plan = await pool.query(
				`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${q.query}`,
				q.params as unknown[],
			);
			const planLines: string[] = [];
			for (const row of plan.rows) {
				const line = (row as Record<string, unknown>)["QUERY PLAN"];
				if (typeof line === "string") planLines.push(line);
			}
			console.log(planLines.join("\n"));
			console.log();

			const outDir = resolve(import.meta.dir, "out");
			try {
				const { mkdirSync } = await import("node:fs");
				mkdirSync(outDir, { recursive: true });
			} catch {
				// ignore
			}
			writeFileSync(
				resolve(outDir, `product-counts-explain-${i + 1}.txt`),
				planLines.join("\n"),
			);
		}
	}

	// Batched alternative — apples-to-apples with the new code shape:
	// status filter pushed into the JOIN predicate so it can hit the partial
	// covering index (idx_customer_products_active_counts).
	console.log("--- Alternative: single batched query (all products, status filter pushed down) ---\n");
	const startBatched = performance.now();
	const batchedResult = await db.execute(sql`
		SELECT
			p.id AS product_id,
			count(DISTINCT cp.internal_customer_id) AS active,
			count(DISTINCT CASE WHEN cp.canceled_at IS NOT NULL THEN cp.internal_customer_id END) AS canceled,
			count(DISTINCT CASE WHEN cp.is_custom = true THEN cp.internal_customer_id END) AS custom,
			count(DISTINCT CASE WHEN cp.trial_ends_at IS NOT NULL AND cp.trial_ends_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint THEN cp.internal_customer_id END) AS trialing,
			count(DISTINCT cp.internal_customer_id) AS all_count
		FROM products p
		LEFT JOIN customer_products cp
		  ON cp.internal_product_id = p.internal_id
		 AND cp.status IN ('active', 'past_due')
		WHERE p.org_id = ${orgId} AND p.env = ${env}
		GROUP BY p.id
	`);
	const elapsedBatched = performance.now() - startBatched;
	console.log(`Batched query: ${elapsedBatched.toFixed(2)}ms (${batchedResult.length} rows)\n`);

	console.log(`--- EXPLAIN (ANALYZE, BUFFERS) on the batched query ---\n`);
	const batchedPlan = await db.execute(sql`
		EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
		SELECT
			p.id AS product_id,
			count(DISTINCT cp.internal_customer_id) AS active,
			count(DISTINCT CASE WHEN cp.canceled_at IS NOT NULL THEN cp.internal_customer_id END) AS canceled,
			count(DISTINCT CASE WHEN cp.is_custom = true THEN cp.internal_customer_id END) AS custom,
			count(DISTINCT CASE WHEN cp.trial_ends_at IS NOT NULL AND cp.trial_ends_at > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint THEN cp.internal_customer_id END) AS trialing,
			count(DISTINCT cp.internal_customer_id) AS all_count
		FROM products p
		LEFT JOIN customer_products cp
		  ON cp.internal_product_id = p.internal_id
		 AND cp.status IN ('active', 'past_due')
		WHERE p.org_id = ${orgId} AND p.env = ${env}
		GROUP BY p.id
	`);
	const batchedPlanLines: string[] = [];
	for (const row of batchedPlan) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		if (typeof line === "string") batchedPlanLines.push(line);
	}
	console.log(batchedPlanLines.join("\n"));
	console.log();

	console.log("--- Table sizes ---\n");
	const sizes = await db.execute(sql`
		SELECT
			'products' AS table_name,
			(SELECT count(*) FROM products) AS total_rows,
			(SELECT count(*) FROM products WHERE org_id = ${orgId} AND env = ${env}) AS org_rows,
			pg_size_pretty(pg_relation_size('products')) AS table_size
		UNION ALL
		SELECT
			'customer_products',
			(SELECT count(*) FROM customer_products),
			(SELECT count(*) FROM customer_products cp
			   WHERE cp.internal_product_id IN
			     (SELECT internal_id FROM products WHERE org_id = ${orgId} AND env = ${env})),
			pg_size_pretty(pg_relation_size('customer_products'))
	`);
	for (const row of sizes) {
		console.log(row);
	}
	console.log();

	console.log("--- Indexes on customer_products / products ---\n");
	const indexes = await db.execute(sql`
		SELECT tablename, indexname, indexdef,
		       pg_size_pretty(pg_relation_size(quote_ident(indexname)::regclass)) AS size
		FROM pg_indexes
		WHERE tablename IN ('customer_products', 'products')
		ORDER BY tablename, indexname
	`);
	for (const row of indexes) {
		console.log(row);
	}

	// Verdict — did the new partial covering index get picked up?
	console.log("\n--- Verdict ---");
	const aggregateQuery = capturedQueries.find((q) => q.query.includes("count(distinct"));
	if (aggregateQuery) {
		const plan = await pool.query(
			`EXPLAIN (FORMAT TEXT) ${aggregateQuery.query}`,
			aggregateQuery.params as unknown[],
		);
		const planText = plan.rows
			.map((r) => (r as Record<string, unknown>)["QUERY PLAN"])
			.join("\n");
		if (planText.includes("idx_customer_products_active_counts")) {
			console.log("✅ Per-product query uses idx_customer_products_active_counts");
		} else if (planText.includes("Index Only Scan")) {
			console.log("✅ Per-product query does an Index Only Scan (no heap)");
		} else if (planText.includes("Seq Scan on customer_products")) {
			console.log("❌ Per-product query falls back to Seq Scan");
		} else {
			console.log("⚠️  Per-product query plan unclear — inspect EXPLAIN above");
		}
	}

	await pool.end();
	process.exit(0);
};

await main();
