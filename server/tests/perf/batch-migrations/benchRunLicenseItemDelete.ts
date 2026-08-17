/**
 * Benchmarks the license item-DELETE batch path end to end against the bench
 * org: seed pools + assignments that hold the feature → prepareMigration →
 * shouldRunBatchLane → runBatchMigrationChunk(maxPages: 1).
 *
 *   ./run.sh <abs path> --customers 20000 --assignments 3 --pages all
 *   ./run.sh <abs path> --cleanup
 *
 * The edit benchmark measures moving a feature's rows onto a minted
 * entitlement. This one measures dropping them, which is the shape a real
 * deletion takes (a bare remove_items with no matching add).
 *
 * Correctness is asserted after the run: no assignment may retain a row for
 * the deleted feature, and none may be left holding a stale one.
 */

import { type Migration, migrations } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { sql } from "drizzle-orm";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_FREE_PRODUCT_ID,
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	getBenchContext,
} from "./utils/benchContext.js";
import {
	BENCH_LICENSE_ENTITLEMENT_ID,
	BENCH_LICENSE_FEATURE_ID,
	ensureBenchLicenseEntitlement,
} from "./utils/ensureBenchLicenseEntitlement.js";
import {
	BENCH_ASSIGNMENT_PREFIX,
	BENCH_CUSTOMER_LICENSE_PREFIX,
	BENCH_ENTITY_PREFIX,
	BENCH_SEAT_ENTITLEMENT_PREFIX,
	seedBenchLicenses,
} from "./utils/seedBenchLicenses.js";

const STARTING_BALANCE = 40;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "all";
	return {
		assignmentsPerCustomer: Number(get("--assignments") ?? "3"),
		customers: Number(get("--customers") ?? "1000"),
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		cleanup: args.includes("--cleanup"),
	};
};

const main = async () => {
	const { assignmentsPerCustomer, customers, pages, cleanup } = parseArgs();
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;

	const cleanupStarted = Date.now();
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE customer_product_id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_products WHERE id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_licenses WHERE id LIKE ${`${BENCH_CUSTOMER_LICENSE_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM entities WHERE internal_id LIKE ${`${BENCH_ENTITY_PREFIX}%`}
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
	`);
	console.log(`bench: cleanup done in ${Date.now() - cleanupStarted}ms`);
	if (cleanup) process.exit(0);

	const [link]: Array<{
		id: string;
		license_internal_product_id: string;
		license_product_id: string;
	}> = await db.execute(sql`
		SELECT pl.id, pl.license_internal_product_id, p.id AS license_product_id
		FROM plan_license pl
		JOIN products parent ON parent.internal_id = pl.parent_internal_product_id
		JOIN products p ON p.internal_id = pl.license_internal_product_id
		WHERE parent.id = ${BENCH_FREE_PRODUCT_ID} AND pl.is_custom = false
		LIMIT 1
	`);
	if (!link) {
		console.error(
			`bench: no catalog license link on ${BENCH_FREE_PRODUCT_ID}. Run benchRunLicenseMigration.ts first — it prints the INSERT.`,
		);
		process.exit(1);
	}

	// The bench org is raw-seeded, so its license plan may grant nothing. The
	// edit needs an entitlement the plan actually issues, or the run measures a
	// repoint that can never match.
	// The edit targets a metered entitlement the license plan already grants,
	// so assignments start holding it and the run must repoint rather than add.
	const licenseProduct = await ensureBenchLicenseEntitlement({ ctx });
	const existing = licenseProduct.entitlements.find(
		(entitlement) => entitlement.id === BENCH_LICENSE_ENTITLEMENT_ID,
	);
	if (!existing) {
		console.error("bench: license entitlement missing after ensure — aborting");
		process.exit(1);
	}

	const seedStarted = Date.now();
	await seedBenchLicenses({
		db,
		count: customers,
		assignmentsPerCustomer,
		licenseInternalProductId: link.license_internal_product_id,
		licenseProductId: link.license_product_id,
		catalogPlanLicenseId: link.id,
		startsAt: Date.now(),
		orgId: org.id,
		env: ctx.env,
		existingEntitlement: {
			entitlementId: existing.id,
			internalFeatureId: existing.internal_feature_id,
			featureId: BENCH_LICENSE_FEATURE_ID,
			balance: STARTING_BALANCE,
		},
	});
	console.log(
		`bench: seeded ${customers.toLocaleString()} pools × ${assignmentsPerCustomer} assignments holding ${BENCH_LICENSE_FEATURE_ID} in ${Date.now() - seedStarted}ms`,
	);

	const migrationId = "bench-mig-license-item-delete";
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
				customer: { plan: { plan_id: BENCH_FREE_PRODUCT_ID } },
			}),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: BENCH_FREE_PRODUCT_ID },
						customize: {
							upsert_licenses: [
								{
									license_plan_id: link.license_product_id,
									customize: {
										remove_items: [{ feature_id: BENCH_LICENSE_FEATURE_ID }],
									},
								},
							],
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
			console.log(
				`bench: page ${page} — ${result.processed.toLocaleString()} customers in ${pageMs}ms`,
			);
		}

		cursor = result.cursor ?? undefined;
		if (result.completion !== "slice_complete") break;
	}

	const totalMs = Date.now() - runStarted;
	const expectedAssignments = customers * assignmentsPerCustomer;

	const [counts]: Array<{
		assignments: string;
		remaining: string;
	}> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}) AS assignments,
			(SELECT count(*) FROM customer_entitlements ce
			 WHERE ce.id LIKE ${`${BENCH_SEAT_ENTITLEMENT_PREFIX}%`}) AS remaining
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
	console.log("");
	console.log(
		`bench: deleted ${BENCH_LICENSE_FEATURE_ID} from every assignment`,
	);
	console.log(
		`bench: assignments ${counts.assignments} (expected ${expectedAssignments})`,
	);
	console.log(`bench: remaining rows ${counts.remaining} (expected 0)`);

	const correct =
		Number(counts.remaining) === 0 &&
		Number(counts.assignments) === expectedAssignments;
	console.log(correct ? "bench: CORRECT" : "bench: INCORRECT");
	process.exit(correct ? 0 : 1);
};

await main();
