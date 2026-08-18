/**
 * Benchmarks a plain version SET — no customize, so the v2 catalog alone
 * determines the incoming product — end to end on the DEV DB:
 * seed v1 holders → prepareMigration → shouldRunBatchLane → runBatchMigrationChunk.
 *
 * The v1 → v2 diff is 3 replaces, 2 deletes, 2 adds, plus the customer-product
 * repoint and one pool repoint per license link. That covers every query this
 * branch added or reshaped: the replace candidate select and balance patch with
 * its anchor ladder, the remove select/delete with the unpaid guard, the
 * rewritten add select, repointCustomerProductRows, and repointLicensePoolRows.
 *
 * A pure version set CANNOT produce license entitlement add/delete/replace ops:
 * the v2 link points at the same license product, so the link diff is empty.
 * Pass --customize-licenses to drive those through customize.upsert_licenses.
 *
 * run.sh drops trailing args, so invoke bun directly to pass flags:
 *
 *   infisical run --env=dev --recursive -- bun <path> --customers 200000
 *   infisical run --env=dev --recursive -- bun <path> --customers 2000 --assignments 1 --customize-licenses
 *   infisical run --env=dev --recursive -- bun <path> --cleanup
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
import { getBenchContext } from "./utils/benchContext.js";
import {
	BENCH_VERSET_ADDED_FEATURES,
	BENCH_VERSET_DELETED_FEATURES,
	BENCH_VERSET_INCLUDED_SEATS,
	BENCH_VERSET_PLAN_ID,
	BENCH_VERSET_REPLACED_FEATURES,
	BENCH_VERSET_V1_ALLOWANCE,
	BENCH_VERSET_V2_ALLOWANCE,
	deleteBenchVersionSetCatalog,
	ensureBenchVersionSetCatalog,
} from "./utils/benchVersionSetCatalog.js";
import {
	BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX,
	BENCH_VERSET_ROW_PREFIX,
	deleteBenchVersionSetClaims,
	deleteBenchVersionSetCustomers,
	seedBenchVersionSet,
} from "./utils/seedBenchVersionSet.js";

const STARTING_BALANCE = 40;
/** A replace patches the balance by the allowance delta. */
const EXPECTED_REPLACED_BALANCE =
	STARTING_BALANCE + BENCH_VERSET_V2_ALLOWANCE - BENCH_VERSET_V1_ALLOWANCE;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "all";
	return {
		customers: Number(get("--customers") ?? "200000"),
		chunk: Number(get("--chunk") ?? "50000"),
		assignments: Number(get("--assignments") ?? "0"),
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		customizeLicenses: args.includes("--customize-licenses"),
		cleanup: args.includes("--cleanup"),
		skipSeed: args.includes("--skip-seed"),
	};
};

const main = async () => {
	const {
		customers,
		chunk,
		assignments,
		pages,
		customizeLicenses,
		cleanup,
		skipSeed,
	} = parseArgs();
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;

	if (cleanup) {
		const started = Date.now();
		await deleteBenchVersionSetCustomers({ db });
		await deleteBenchVersionSetCatalog({ db });
		console.log(`bench: cleanup done in ${Date.now() - started}ms`);
		process.exit(0);
	}

	const catalog = await ensureBenchVersionSetCatalog({
		db,
		orgId: org.id,
		env: ctx.env,
		features: ctx.features,
	});
	console.log(
		`bench: catalog ${catalog.planId} v1=${catalog.v1InternalProductId} v2=${catalog.v2InternalProductId}, ${catalog.licenses.length} license links`,
	);

	if (!skipSeed) {
		// Every measured row is rewritten by the run, so re-seed from scratch.
		await deleteBenchVersionSetCustomers({ db });

		const itemsPerCustomer = catalog.v1EntitlementIdsByFeature.size;
		const seatRows =
			assignments *
			catalog.licenses.reduce(
				(total, license) => total + license.entitlementIdsByFeature.size,
				0,
			);
		console.log(
			`bench: seeding ${customers.toLocaleString()} customers — ${(customers * itemsPerCustomer).toLocaleString()} item rows, ${(customers * catalog.licenses.length).toLocaleString()} pools, ${(customers * seatRows).toLocaleString()} seat item rows`,
		);
		const seedStarted = Date.now();
		await seedBenchVersionSet({
			db,
			catalog,
			features: ctx.features,
			orgId: org.id,
			env: ctx.env,
			count: customers,
			chunk,
			balance: STARTING_BALANCE,
			includedSeats: BENCH_VERSET_INCLUDED_SEATS,
			assignmentsPerCustomer: assignments,
		});
		console.log(`bench: seed done in ${Date.now() - seedStarted}ms`);

		const vacuumStarted = Date.now();
		await db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
		await db.execute(sql`VACUUM (ANALYZE) customer_products`);
		await db.execute(sql`VACUUM (ANALYZE) customer_licenses`);
		console.log(`bench: vacuum done in ${Date.now() - vacuumStarted}ms`);
	}

	await deleteBenchVersionSetClaims({ db });

	const migrationId = customizeLicenses
		? "bench-mig-verset-customize-licenses"
		: "bench-mig-verset";
	await db.execute(
		sql`DELETE FROM migrations WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${migrationId}`,
	);

	const planFilter = {
		plan_id: BENCH_VERSET_PLAN_ID,
		version: 1,
		custom: false,
	};
	const customize = customizeLicenses
		? {
				upsert_licenses: catalog.licenses.map((license) => ({
					license_plan_id: license.licensePlanId,
					customize: {
						add_items: [
							...BENCH_VERSET_REPLACED_FEATURES.map((featureId) => ({
								feature_id: featureId,
								included: BENCH_VERSET_V2_ALLOWANCE,
								reset: { interval: "month" },
							})),
							...BENCH_VERSET_ADDED_FEATURES.map((featureId) => ({
								feature_id: featureId,
								included: BENCH_VERSET_V1_ALLOWANCE,
								reset: { interval: "month" },
							})),
						],
						remove_items: BENCH_VERSET_DELETED_FEATURES.map((featureId) => ({
							feature_id: featureId,
						})),
					},
				})),
			}
		: undefined;

	const [migration] = (await db
		.insert(migrations)
		.values({
			internal_id: generateId("mig"),
			id: migrationId,
			org_id: org.id,
			env: ctx.env,
			filter: MigrationFilterSchema.parse({ customer: { plan: planFilter } }),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: planFilter,
						version: 2,
						...(customize ? { customize } : {}),
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
		console.error(
			"bench: batch lane rejected the migration",
			JSON.stringify(batchLane.rejections, null, 2),
		);
		process.exit(1);
	}

	const executionPlan = batchMigrationPlanToExecutionPlan({
		plan: batchLane.plan,
	});
	const lowered = executionPlan.patches.reduce(
		(totals, patch) => ({
			replaces: totals.replaces + patch.replaceEntitlementOps.length,
			removes: totals.removes + patch.removeEntitlementOps.length,
			adds: totals.adds + patch.addEntitlementOps.length,
			repoints:
				totals.repoints + (patch.repointCustomerProduct === undefined ? 0 : 1),
			poolRepoints:
				totals.poolRepoints +
				patch.licenseEntitlementOps.filter(
					(op) => op.type === "repoint_license_pool",
				).length,
			licenseItemOps:
				totals.licenseItemOps +
				patch.licenseEntitlementOps.filter(
					(op) => op.type !== "repoint_license_pool",
				).length,
		}),
		{
			replaces: 0,
			removes: 0,
			adds: 0,
			repoints: 0,
			poolRepoints: 0,
			licenseItemOps: 0,
		},
	);

	console.log(`bench: prepare ${prepareMs}ms, lane decision ${laneMs}ms`);
	console.log(
		`bench: lowered — ${lowered.replaces} replace, ${lowered.removes} remove, ${lowered.adds} add, ${lowered.repoints} product repoint, ${lowered.poolRepoints} pool repoint, ${lowered.licenseItemOps} license item ops`,
	);

	const expected = {
		replaces: BENCH_VERSET_REPLACED_FEATURES.length,
		removes: BENCH_VERSET_DELETED_FEATURES.length,
		adds: BENCH_VERSET_ADDED_FEATURES.length,
		repoints: 1,
		poolRepoints: catalog.licenses.length,
		// A pure version set links the same license product, so the link diff is
		// empty; only customize.upsert_licenses reaches license item ops.
		licenseItemOps: customizeLicenses
			? catalog.licenses.length *
				(BENCH_VERSET_REPLACED_FEATURES.length +
					BENCH_VERSET_ADDED_FEATURES.length +
					BENCH_VERSET_DELETED_FEATURES.length)
			: 0,
	};
	const shapeCorrect =
		lowered.replaces === expected.replaces &&
		lowered.removes === expected.removes &&
		lowered.adds === expected.adds &&
		lowered.repoints === expected.repoints &&
		lowered.poolRepoints === expected.poolRepoints &&
		lowered.licenseItemOps === expected.licenseItemOps;
	if (!shapeCorrect) {
		console.error(
			`bench: lowered shape is not the intended version set (expected ${expected.replaces} replace, ${expected.removes} remove, ${expected.adds} add, ${expected.repoints} repoint, ${expected.poolRepoints} pool repoint, ${expected.licenseItemOps} license item ops)`,
		);
		process.exit(1);
	}

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
	const ranToCompletion = pages === Number.POSITIVE_INFINITY;

	const replacedIds = BENCH_VERSET_REPLACED_FEATURES.map((featureId) =>
		catalog.v2EntitlementIdsByFeature.get(featureId),
	).filter((id): id is string => Boolean(id));
	const addedIds = BENCH_VERSET_ADDED_FEATURES.map((featureId) =>
		catalog.v2EntitlementIdsByFeature.get(featureId),
	).filter((id): id is string => Boolean(id));
	// Customize mints its own link rows, so the lowered ops — not the v2 catalog
	// links — name the rows the pools must end up on.
	const poolTargetIds = executionPlan.patches.flatMap((patch) =>
		patch.licenseEntitlementOps
			.filter((op) => op.type === "repoint_license_pool")
			.map((op) => op.planLicenseId),
	);

	const [counts]: Array<Record<string, string>> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX}%`}
			   AND internal_product_id = ${catalog.v2InternalProductId}) AS repointed_products,
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${BENCH_VERSET_CUSTOMER_PRODUCT_PREFIX}%`}
			   AND internal_product_id = ${catalog.v1InternalProductId}) AS stale_products,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_VERSET_ROW_PREFIX}%`}
			   AND entitlement_id = ANY(${sql.param(replacedIds)}::text[])) AS replaced_rows,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_VERSET_ROW_PREFIX}%`}
			   AND entitlement_id = ANY(${sql.param(replacedIds)}::text[])
			   AND balance IS DISTINCT FROM ${EXPECTED_REPLACED_BALANCE}) AS wrong_balance,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_VERSET_ROW_PREFIX}%`}
			   AND feature_id = ANY(${sql.param([...BENCH_VERSET_DELETED_FEATURES])}::text[])) AS surviving_deleted,
			(SELECT count(*) FROM customer_entitlements
			 WHERE entitlement_id = ANY(${sql.param(addedIds)}::text[])) AS added_rows,
			(SELECT count(*) FROM customer_licenses
			 WHERE internal_customer_id LIKE ${`cus_bench_verset_%`}
			   AND plan_license_id = ANY(${sql.param(poolTargetIds)}::text[])) AS repointed_pools,
			(SELECT count(*) FROM customer_licenses
			 WHERE internal_customer_id LIKE ${`cus_bench_verset_%`}
			   AND plan_license_id <> ALL(${sql.param(poolTargetIds)}::text[])) AS stale_pools
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
			`bench: phases — ${phases.map(([phase, ms]) => `${phase}=${ms}ms`).join(" ")}`,
		);
	}

	console.log("");
	console.log(
		`bench: products repointed ${counts.repointed_products}, still on v1 ${counts.stale_products}`,
	);
	console.log(
		`bench: replaced rows ${counts.replaced_rows} (expected ${(customers * expected.replaces).toLocaleString()}), wrong balance ${counts.wrong_balance} (expected balance ${EXPECTED_REPLACED_BALANCE})`,
	);
	console.log(
		`bench: surviving deleted rows ${counts.surviving_deleted} (expected 0)`,
	);
	console.log(
		`bench: added rows ${counts.added_rows} (expected ${(customers * expected.adds).toLocaleString()})`,
	);
	console.log(
		`bench: pools repointed ${counts.repointed_pools}, stale ${counts.stale_pools}`,
	);

	const correct =
		!ranToCompletion ||
		(Number(counts.repointed_products) === customers &&
			Number(counts.stale_products) === 0 &&
			Number(counts.replaced_rows) === customers * expected.replaces &&
			Number(counts.wrong_balance) === 0 &&
			Number(counts.surviving_deleted) === 0 &&
			Number(counts.added_rows) === customers * expected.adds &&
			Number(counts.repointed_pools) === customers * catalog.licenses.length &&
			Number(counts.stale_pools) === 0);
	console.log(correct ? "bench: CORRECT" : "bench: INCORRECT");
	process.exit(correct ? 0 : 1);
};

await main();
