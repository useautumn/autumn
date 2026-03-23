import { AppEnv, customers } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { initDrizzle, prodTestCustomerId, prodTestOrgId } from "./experimentEnv";

// Run with `bun run experiments/explainGetByStripeId.ts`

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;

	const { db } = initDrizzle();

	// Grab a real stripe ID from the test customer
	const testCus = await db.query.customers.findFirst({
		where: and(
			eq(customers.id, prodTestCustomerId),
			eq(customers.org_id, orgId),
			eq(customers.env, env),
		),
	});

	const stripeId = testCus?.processor?.id;
	if (!stripeId) {
		console.error("Test customer has no processor.id");
		process.exit(1);
	}

	console.log(`Using stripeId: ${stripeId}`);
	console.log(`Org: ${orgId} | Env: ${env}\n`);

	// ── Check index validity ─────────────────────────────────────────
	console.log("=== INDEX VALIDITY ===\n");
	const idxValid = await db.execute(sql`
		SELECT c.relname, i.indisvalid, i.indisready, i.indislive,
		       pg_size_pretty(pg_relation_size(c.oid)) as size
		FROM pg_index i
		JOIN pg_class c ON c.oid = i.indexrelid
		WHERE c.relname LIKE '%processor%'
	`);
	for (const row of idxValid) {
		console.log(row);
	}

	// ── Query with org/env (matches CusService.getByStripeId) ────────
	const withOrgEnv = sql`
		SELECT * FROM customers
		WHERE processor->>'id' = ${stripeId}
		  AND org_id = ${orgId}
		  AND env = ${env}
		LIMIT 1
	`;

	console.log("\n=== QUERY: processor->>'id' + org/env ===\n");

	const start1 = performance.now();
	const result1 = await db.execute(withOrgEnv);
	const elapsed1 = performance.now() - start1;
	console.log(`Rows: ${result1.length} | Time: ${elapsed1.toFixed(2)}ms\n`);

	const explain1 = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${withOrgEnv}`,
	);
	for (const row of explain1) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	// ── Query without org/env (isolate expression index usage) ───────
	const withoutOrgEnv = sql`
		SELECT * FROM customers
		WHERE processor->>'id' = ${stripeId}
		LIMIT 1
	`;

	console.log("\n=== QUERY: processor->>'id' only ===\n");

	const start2 = performance.now();
	const result2 = await db.execute(withoutOrgEnv);
	const elapsed2 = performance.now() - start2;
	console.log(`Rows: ${result2.length} | Time: ${elapsed2.toFixed(2)}ms\n`);

	const explain2 = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${withoutOrgEnv}`,
	);
	for (const row of explain2) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	process.exit(0);
};

await main();
