/**
 * Benchmarks the license-customize batch path end to end against the bench org,
 * driving the production path page by page:
 * seed pools + assignments → prepareMigration → shouldRunBatchLane →
 * runBatchMigrationChunk(maxPages: 1).
 *
 *   bun tests/perf/batch-migrations/benchRunLicenseMigration.ts --assignments 3 --pages all
 *   bun tests/perf/batch-migrations/benchRunLicenseMigration.ts --cleanup
 *
 * Correctness is asserted after the run: every live assignment under a
 * repointed pool must carry exactly one row for the added feature.
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
	BENCH_ASSIGNMENT_PREFIX,
	BENCH_CUSTOMER_LICENSE_PREFIX,
	BENCH_ENTITY_PREFIX,
	seedBenchLicenses,
} from "./utils/seedBenchLicenses.js";

const LICENSE_FEATURE_ID = "dashboard";

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

	// The bench org's catalog link for the license plan — pools start here so
	// the run measures the real repoint, not a pre-pointed shortcut.
	const [link]: Array<{
		id: string;
		license_internal_product_id: string;
		parent_internal_product_id: string;
		license_product_id: string;
	}> = await db.execute(sql`
		SELECT pl.id, pl.license_internal_product_id, pl.parent_internal_product_id,
			p.id AS license_product_id
		FROM plan_license pl
		JOIN products parent ON parent.internal_id = pl.parent_internal_product_id
		JOIN products p ON p.internal_id = pl.license_internal_product_id
		WHERE parent.id = ${BENCH_FREE_PRODUCT_ID} AND pl.is_custom = false
		LIMIT 1
	`);
	if (!link) {
		console.error(
			`bench: no catalog license link on ${BENCH_FREE_PRODUCT_ID}. Create one with:\n` +
				`  INSERT INTO plan_license (id, parent_internal_product_id, license_internal_product_id,\n` +
				`    is_custom, included, prepaid_only, customized, metadata, created_at, updated_at)\n` +
				`  SELECT 'plan_lic_bench', parent.internal_id, lic.internal_id, false, 3, true, false,\n` +
				`    '{}'::jsonb, ${Date.now()}, ${Date.now()}\n` +
				`  FROM products parent, products lic\n` +
				`  WHERE parent.id = '${BENCH_FREE_PRODUCT_ID}' AND lic.id = 'bench-paid'\n` +
				`    AND parent.org_id = '${org.id}' AND lic.org_id = '${org.id}';`,
		);
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
	});
	console.log(
		`bench: seeded ${customers.toLocaleString()} pools × ${assignmentsPerCustomer} assignments in ${Date.now() - seedStarted}ms`,
	);

	const migrationId = "bench-mig-license";
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
										add_items: [{ feature_id: LICENSE_FEATURE_ID }],
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

	// Correctness: every live assignment gained exactly one row for the feature.
	const [counts]: Array<{
		assignments: string;
		with_feature: string;
		duplicates: string;
	}> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}) AS assignments,
			(SELECT count(DISTINCT ce.customer_product_id)
			 FROM customer_entitlements ce
			 JOIN features f ON f.internal_id = ce.internal_feature_id
			 WHERE ce.customer_product_id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}
				AND f.id = ${LICENSE_FEATURE_ID}) AS with_feature,
			(SELECT count(*) FROM (
				SELECT ce.customer_product_id
				FROM customer_entitlements ce
				JOIN features f ON f.internal_id = ce.internal_feature_id
				WHERE ce.customer_product_id LIKE ${`${BENCH_ASSIGNMENT_PREFIX}%`}
					AND f.id = ${LICENSE_FEATURE_ID}
				GROUP BY ce.customer_product_id HAVING count(*) > 1
			) AS dupes) AS duplicates
	`);

	console.log("bench: ─────────────────────────────────────────");
	console.log(
		`bench: ${pageTimings.length} pages, ${totalProcessed.toLocaleString()} customers in ${totalMs}ms`,
	);
	console.log(
		`bench: ${Number(counts.with_feature).toLocaleString()}/${expectedAssignments.toLocaleString()} assignments carry '${LICENSE_FEATURE_ID}'`,
	);
	console.log(
		`bench: ${totalMs > 0 ? Math.round((expectedAssignments / totalMs) * 1000).toLocaleString() : 0} assignments/s`,
	);

	const correct =
		Number(counts.with_feature) === expectedAssignments &&
		Number(counts.duplicates) === 0;
	console.log(
		correct
			? "bench: CORRECT — every assignment has exactly one row"
			: `bench: INCORRECT — ${counts.duplicates} duplicated, ${expectedAssignments - Number(counts.with_feature)} missing`,
	);
	process.exit(correct ? 0 : 1);
};

await main();
