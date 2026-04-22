import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
    initDrizzle,
    prodTestCustomerId,
    prodTestOrgId,
} from "./experimentEnv";
import { OrgService } from "@/internal/orgs/OrgService";

const { getEntityAggregateForSync } = await import(
	"../src/internal/customers/repos/getFullSubject/getEntityAggregateForSync"
);

// Run with `bun run experiments/explainEntityAggregate.ts`

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;
	const customerId = prodTestCustomerId;

	const { db } = initDrizzle();

	const org = await OrgService.getWithFeatures({
		db,
		orgId,
		env,
	});

	const features = org?.features.filter((feature) => feature.id.toLowerCase().includes("credit"));
	

	console.log("--- Running entity aggregate query ---");
	const start = performance.now();
	const result = await getEntityAggregateForSync({
		db,
		orgId,
		env,
		customerId,
		internalFeatureIds: features?.map((feature) => feature.internal_id),
	});
	const elapsed = performance.now() - start;
	console.log(`Rows returned: ${result.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms`);
	console.log("Result:", JSON.stringify(result, null, 2));
	console.log();

	// Build the same query inline for EXPLAIN ANALYZE
	const { getEntityAggregateFragments } = await import(
		"../src/internal/customers/repos/getFullSubject/getEntityAggregateFragments"
	);

	const statusFilter = sql`AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])`;
	const entityFragments = getEntityAggregateFragments({
		statusFilter,
		internalFeatureIds: features?.map((feature) => feature.internal_id),
	});

	const query = sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				AND (c.id = ${customerId} OR c.internal_id = ${customerId})
			ORDER BY (c.id = ${customerId}) DESC
			LIMIT 1
		)

		${entityFragments.ctes}

		SELECT *
		FROM entity_aggregated_cus_entitlements
	`;

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
