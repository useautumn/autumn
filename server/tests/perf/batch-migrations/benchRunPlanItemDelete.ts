/**
 * Benchmarks the plain plan item-DELETE batch path end to end against the bench
 * org: seed customers holding the feature → prepareMigration →
 * shouldRunBatchLane → runBatchMigrationChunk(maxPages: 1).
 *
 * run.sh drops trailing args, so invoke bun directly to pass flags:
 *
 *   infisical run --env=dev --recursive -- bun <path> --customers 20000 --pages all
 *   infisical run --env=dev --recursive -- bun <path> --cleanup
 *
 * The license delete drops rows off entity-scoped seat assignments. This one
 * drops them off the customer products themselves, which is the higher-volume
 * shape: every customer on the plan holds a row, not just those with seats.
 *
 * Runs on its own plan and re-seeds each time: a delete consumes the rows it
 * measures, and the shared seedBatchBench dataset is other benches' baseline.
 * The VACUUM matters — repeated mass-DELETE cycles leave dead tuples that
 * degrade the claim select from ~150ms to seconds until autovacuum catches up.
 */

import { type Migration, migrations } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { TestFeature } from "@tests/setup/v2Features";
import { sql } from "drizzle-orm";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_CUSTOMER_ENTITLEMENT_PREFIX,
	getBenchContext,
} from "./utils/benchContext.js";
import {
	BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX,
	BENCH_PLANDEL_ENTITLEMENT_PREFIX,
	BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX,
	BENCH_PLANDEL_PRODUCT_ID,
	ensureBenchPlanDeleteProduct,
	seedBenchPlanItems,
} from "./utils/seedBenchPlanItems.js";

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "all";
	return {
		customers: Number(get("--customers") ?? "1000"),
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		cleanup: args.includes("--cleanup"),
	};
};

const main = async () => {
	const { customers, pages, cleanup } = parseArgs();
	const { ctx, org, benchProducts } = await getBenchContext();
	const { db } = ctx;

	const cleanupStarted = Date.now();
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE id LIKE ${`${BENCH_PLANDEL_ENTITLEMENT_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_products
		WHERE id LIKE ${`${BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX}%`}
	`);
	console.log(`bench: cleanup done in ${Date.now() - cleanupStarted}ms`);
	if (cleanup) {
		await db.execute(sql`
			DELETE FROM customers
			WHERE internal_id LIKE ${`${BENCH_PLANDEL_INTERNAL_CUSTOMER_PREFIX}%`}
		`);
		process.exit(0);
	}

	const { internalProductId, entitlementId } =
		await ensureBenchPlanDeleteProduct({
			db,
			orgId: org.id,
			env: ctx.env,
			internalFeatureId: benchProducts.messagesInternalFeatureId,
			featureId: TestFeature.Messages,
		});

	const seedStarted = Date.now();
	await seedBenchPlanItems({
		db,
		count: customers,
		planInternalProductId: internalProductId,
		planProductId: BENCH_PLANDEL_PRODUCT_ID,
		entitlementId,
		internalFeatureId: benchProducts.messagesInternalFeatureId,
		featureId: TestFeature.Messages,
		startsAt: Date.now(),
		orgId: org.id,
		env: ctx.env,
	});
	console.log(
		`bench: seeded ${customers.toLocaleString()} customers holding ${TestFeature.Messages} in ${Date.now() - seedStarted}ms`,
	);

	// Dead tuples from the cleanup above skew the claim select otherwise.
	const vacuumStarted = Date.now();
	await db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
	await db.execute(sql`VACUUM (ANALYZE) customer_products`);
	console.log(`bench: vacuum done in ${Date.now() - vacuumStarted}ms`);

	const [before]: Array<{ shared: string }> = await db.execute(sql`
		SELECT count(*) AS shared FROM customer_entitlements
		WHERE id LIKE ${`${BENCH_CUSTOMER_ENTITLEMENT_PREFIX}%`}
		  AND id NOT LIKE ${`${BENCH_PLANDEL_ENTITLEMENT_PREFIX}%`}
	`);
	const sharedBefore = Number(before.shared);

	const migrationId = "bench-mig-plan-item-delete";
	await db.execute(
		sql`DELETE FROM migrations WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${migrationId}`,
	);
	const [migration] = (await db
		.insert(migrations)
		.values({
			internal_id: generateId("mig"),
			id: migrationId,
			org_id: org.id,
			env: ctx.env,
			filter: MigrationFilterSchema.parse({
				customer: {
					plan: { plan_id: BENCH_PLANDEL_PRODUCT_ID, custom: false },
				},
			}),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: BENCH_PLANDEL_PRODUCT_ID, custom: false },
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
						},
					},
				],
			}),
			no_billing_changes: true,
			retry_failed: false,
			archived: false,
			created_at: Date.now(),
		})
		.returning()) as Migration[];

	const migrationRunId = generateId("bench_run");
	const prepareStarted = Date.now();
	const preparedMigration = await prepareMigration({
		ctx,
		migration,
		dryRun: false,
	});
	const prepareMs = Date.now() - prepareStarted;

	const laneStarted = Date.now();
	const batchLane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	const laneMs = Date.now() - laneStarted;
	if (!batchLane.shouldRun) {
		console.error("bench: batch lane rejected the migration", batchLane);
		process.exit(1);
	}
	const executionPlan = batchMigrationPlanToExecutionPlan({
		plan: batchLane.plan,
	});
	console.log(`bench: prepare ${prepareMs}ms, lane decision ${laneMs}ms`);

	let cursor: string | undefined;
	let page = 0;
	let totalProcessed = 0;
	const pageTimings: number[] = [];
	const phaseTotals: Record<string, number> = {};
	const runStarted = Date.now();

	while (page < pages) {
		const pageStarted = Date.now();
		const result = await runBatchMigrationChunk({
			ctx,
			migration: preparedMigration,
			migrationRunId,
			plan: executionPlan,
			afterInternalId: cursor,
			maxPages: 1,
		});
		const pageMs = Date.now() - pageStarted;

		if (result.summary.pages > 0) {
			page += 1;
			pageTimings.push(pageMs);
			totalProcessed += result.processed;
			for (const [phase, ms] of Object.entries(result.summary.phases ?? {})) {
				phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms;
			}
			console.log(
				`bench: page ${page} — ${result.processed.toLocaleString()} customers in ${pageMs}ms`,
			);
		}

		cursor = result.cursor ?? undefined;
		if (result.completion !== "slice_complete") break;
	}

	const totalMs = Date.now() - runStarted;

	const [counts]: Array<{
		holders: string;
		remaining: string;
		shared: string;
	}> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${BENCH_PLANDEL_CUSTOMER_PRODUCT_PREFIX}%`}) AS holders,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_PLANDEL_ENTITLEMENT_PREFIX}%`}) AS remaining,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_CUSTOMER_ENTITLEMENT_PREFIX}%`}
			   AND id NOT LIKE ${`${BENCH_PLANDEL_ENTITLEMENT_PREFIX}%`}) AS shared
	`);

	const rate = totalProcessed / (totalMs / 1000);
	console.log("");
	console.log(
		`bench: ${totalProcessed.toLocaleString()} customers in ${totalMs}ms`,
	);
	console.log(`bench: ${Math.round(rate).toLocaleString()} customers/sec`);
	if (pageTimings.length > 1) {
		const sorted = [...pageTimings].sort((a, b) => a - b);
		console.log(
			`bench: page ms — min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted[sorted.length - 1]}`,
		);
	}
	const phases = Object.entries(phaseTotals).sort(([, a], [, b]) => b - a);
	if (phases.length > 0) {
		console.log(
			`bench:   phases: ${phases.map(([phase, ms]) => `${phase}=${ms}ms`).join(" ")}`,
		);
	}
	console.log("");
	console.log(`bench: deleted ${TestFeature.Messages} from every customer`);
	console.log(`bench: holders ${counts.holders} (expected ${customers})`);
	console.log(`bench: remaining rows ${counts.remaining} (expected 0)`);
	console.log(
		`bench: shared dataset rows ${counts.shared} (expected ${sharedBefore}, untouched)`,
	);

	const correct =
		Number(counts.remaining) === 0 &&
		Number(counts.holders) === customers &&
		Number(counts.shared) === sharedBefore;
	console.log(correct ? "bench: CORRECT" : "bench: INCORRECT");
	process.exit(correct ? 0 : 1);
};

await main();
