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
	const parsedResult = await getEntityAggregateForSync({
		db,
		orgId,
		env,
		customerId,
		internalFeatureIds: features?.map((feature) => feature.internal_id),
	});
	const elapsed = performance.now() - start;
	console.log(`Rows (after schema parse): ${parsedResult.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms\n`);

	// Also fetch raw rows so we can see the output even if schema parse fails
	const { getEntityAggregateFragments } = await import(
		"../src/internal/customers/repos/getFullSubject/getEntityAggregateFragments"
	);
	const statusFilterRaw = sql`AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])`;
	const entityFragmentsRaw = getEntityAggregateFragments({
		statusFilter: statusFilterRaw,
		internalFeatureIds: features?.map((feature) => feature.internal_id),
	});
	const rawQuery = sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				AND (c.id = ${customerId} OR c.internal_id = ${customerId})
			ORDER BY (c.id = ${customerId}) DESC
			LIMIT 1
		)
		${entityFragmentsRaw.ctes}
		SELECT *
		FROM entity_aggregated_cus_entitlements
	`;
	const rawResult = await db.execute(rawQuery);
	const result = rawResult as unknown as Record<string, unknown>[];
	console.log(`Raw rows: ${result.length}\n`);

	console.log("--- Entity aggregate output (per feature) ---\n");
	for (const row of result) {
		const entities = (row as unknown as { entities?: Record<string, unknown> })
			.entities;
		const entityCount = (row as unknown as { entity_count?: number })
			.entity_count;
		const entityKeys = entities ? Object.keys(entities) : [];

		console.log(`feature_id: ${row.feature_id}`);
		console.log(`  internal_feature_id: ${row.internal_feature_id}`);
		console.log(`  balance: ${row.balance}`);
		console.log(`  adjustment: ${row.adjustment}`);
		console.log(`  additional_balance: ${row.additional_balance}`);
		console.log(`  rollover_balance: ${row.rollover_balance}`);
		console.log(`  entity_count: ${entityCount}`);
		console.log(`  entities keys (${entityKeys.length}): ${JSON.stringify(entityKeys)}`);
		console.log(`  entities: ${JSON.stringify(entities, null, 2)}`);
		console.log();
	}

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
