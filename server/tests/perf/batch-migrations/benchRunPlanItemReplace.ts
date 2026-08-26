/**
 * Benchmarks the plain plan item-REPLACE batch path end to end against the
 * bench org on the DEV DB: seed customers holding a partly-consumed allowance
 * → prepareMigration → shouldRunBatchLane → runBatchMigrationChunk.
 *
 * run.sh drops trailing args, so invoke bun directly to pass flags:
 *
 *   infisical run --env=dev --recursive -- bun <path> --customers 400000 --pages all
 *   infisical run --env=dev --recursive -- bun <path> --customers 50000 --groups 10
 *   infisical run --env=dev --recursive -- bun <path> --cleanup
 *
 * Isolated from seedBatchBench: a replace rewrites entitlement_id + balance
 * on every measured row, so it re-seeds its own plan each run.
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
	BENCH_PLANREP_PREFIXES,
	ensureBenchPlanItemProduct,
	seedBenchPlanItems,
} from "./utils/seedBenchPlanItems.js";

const FROM_ALLOWANCE = 100;
const TO_ALLOWANCE = 200;
const STARTING_BALANCE = 40;
const EXPECTED_BALANCE = STARTING_BALANCE + TO_ALLOWANCE - FROM_ALLOWANCE;

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "all";
	return {
		customers: Number(get("--customers") ?? "400000"),
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		groups: Number(get("--groups") ?? "1"),
		cleanup: args.includes("--cleanup"),
	};
};

const GROUP_ENTITLEMENT_PREFIX = "ent_bench_planrep_g_";

const main = async () => {
	const { customers, pages, groups, cleanup } = parseArgs();
	const { ctx, org, benchProducts } = await getBenchContext();
	const { db } = ctx;
	const prefixes = BENCH_PLANREP_PREFIXES;

	const cleanupStarted = Date.now();
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE id LIKE ${`${prefixes.entitlement}%`}
	`);
	await db.execute(sql`
		DELETE FROM customer_products
		WHERE id LIKE ${`${prefixes.customerProduct}%`}
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${prefixes.internalCustomer}%`}
	`);
	await db.execute(sql`
		DELETE FROM entitlements
		WHERE id LIKE ${`${GROUP_ENTITLEMENT_PREFIX}%`}
	`);
	console.log(`bench: cleanup done in ${Date.now() - cleanupStarted}ms`);
	if (cleanup) {
		await db.execute(sql`
			DELETE FROM customers
			WHERE internal_id LIKE ${`${prefixes.internalCustomer}%`}
		`);
		process.exit(0);
	}

	const { internalProductId, entitlementId } = await ensureBenchPlanItemProduct(
		{
			db,
			orgId: org.id,
			env: ctx.env,
			internalFeatureId: benchProducts.messagesInternalFeatureId,
			featureId: TestFeature.Messages,
			productId: prefixes.productId,
			name: "Bench Plan Replace",
			allowance: FROM_ALLOWANCE,
		},
	);

	const seedStarted = Date.now();
	await seedBenchPlanItems({
		db,
		count: customers,
		planInternalProductId: internalProductId,
		planProductId: prefixes.productId,
		entitlementId,
		internalFeatureId: benchProducts.messagesInternalFeatureId,
		featureId: TestFeature.Messages,
		startsAt: Date.now(),
		orgId: org.id,
		env: ctx.env,
		prefixes,
		balance: STARTING_BALANCE,
	});
	console.log(
		`bench: seeded ${customers.toLocaleString()} customers holding ${TestFeature.Messages} @ ${STARTING_BALANCE} in ${Date.now() - seedStarted}ms`,
	);

	if (groups > 1) {
		const groupStarted = Date.now();
		await db.execute(sql`
			INSERT INTO entitlements (
				id, created_at, org_id, internal_product_id, internal_feature_id,
				feature_id, allowance_type, allowance, interval, interval_count, is_custom
			)
			SELECT
				${GROUP_ENTITLEMENT_PREFIX} || i,
				${Date.now()},
				${org.id},
				${internalProductId},
				${benchProducts.messagesInternalFeatureId},
				${TestFeature.Messages},
				'fixed',
				10 + i,
				'month',
				1,
				true
			FROM GENERATE_SERIES(1, ${groups}) AS i
			ON CONFLICT (id) DO NOTHING
		`);
		await db.execute(sql`
			UPDATE customer_entitlements AS live
			SET entitlement_id = ${GROUP_ENTITLEMENT_PREFIX} || (
				((SPLIT_PART(live.customer_id, '-', 4))::int - 1) % ${groups} + 1
			)
			WHERE live.id LIKE ${`${prefixes.entitlement}%`}
		`);
		console.log(
			`bench: split into ${groups} live defs (allowance 11..${10 + groups}) in ${Date.now() - groupStarted}ms`,
		);
	}

	const vacuumStarted = Date.now();
	await db.execute(sql`VACUUM (ANALYZE) customer_entitlements`);
	await db.execute(sql`VACUUM (ANALYZE) customer_products`);
	console.log(`bench: vacuum done in ${Date.now() - vacuumStarted}ms`);

	const [before]: Array<{ shared: string }> = await db.execute(sql`
		SELECT count(*) AS shared FROM customer_entitlements
		WHERE id LIKE ${`${BENCH_CUSTOMER_ENTITLEMENT_PREFIX}%`}
		  AND id NOT LIKE ${`${prefixes.entitlement}%`}
	`);
	const sharedBefore = Number(before.shared);

	const migrationId = "bench-mig-plan-item-replace";
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
					plan: { plan_id: prefixes.productId, custom: false },
				},
			}),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: prefixes.productId, custom: false },
						customize: {
							add_items: [
								{
									feature_id: TestFeature.Messages,
									included: TO_ALLOWANCE,
									reset: { interval: "month" },
								},
							],
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
	const replaceOps = executionPlan.patches.flatMap(
		(patch) => patch.replaceEntitlementOps,
	);
	if (replaceOps.length === 0) {
		console.error("bench: plan did not lower to a replace op", executionPlan);
		process.exit(1);
	}
	console.log(`bench: prepare ${prepareMs}ms, lane decision ${laneMs}ms`);
	console.log(
		`bench: replace ops ${replaceOps.length} (${groups > 1 ? `${groups} live defs → ${TO_ALLOWANCE}` : `${FROM_ALLOWANCE} → ${TO_ALLOWANCE}`})`,
	);

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

	const toEntitlementId = replaceOps[0]?.entitlement.id;
	if (!toEntitlementId) {
		console.error("bench: replace op missing minted entitlement");
		process.exit(1);
	}

	const [counts]: Array<{
		holders: string;
		rows: string;
		repointed: string;
		stale: string;
		wrong_balance: string;
		shared: string;
	}> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${prefixes.customerProduct}%`}) AS holders,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}) AS rows,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}
			   AND entitlement_id = ${toEntitlementId}) AS repointed,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}
			   AND entitlement_id <> ${toEntitlementId}) AS stale,
			(SELECT count(*) FROM customer_entitlements AS live
			 WHERE live.id LIKE ${`${prefixes.entitlement}%`}
			   AND live.balance IS DISTINCT FROM (
					(${STARTING_BALANCE})::numeric + (${TO_ALLOWANCE})::numeric - CASE
						WHEN ${groups} <= 1 THEN (${FROM_ALLOWANCE})::numeric
						ELSE 10::numeric + (((SPLIT_PART(live.customer_id, '-', 4))::int - 1) % ${groups} + 1)
					END
			   )) AS wrong_balance,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_CUSTOMER_ENTITLEMENT_PREFIX}%`}
			   AND id NOT LIKE ${`${prefixes.entitlement}%`}) AS shared
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

	const ranToCompletion = pages === Number.POSITIVE_INFINITY;
	console.log("");
	console.log(
		groups > 1
			? `bench: ${groups} live defs (allowance 11..${10 + groups}) → ${TO_ALLOWANCE}, start balance ${STARTING_BALANCE}`
			: `bench: allowance ${FROM_ALLOWANCE} → ${TO_ALLOWANCE}, start balance ${STARTING_BALANCE} → ${EXPECTED_BALANCE}`,
	);
	console.log(`bench: holders ${counts.holders} (expected ${customers})`);
	console.log(`bench: rows ${counts.rows} (expected ${customers})`);
	console.log(
		`bench: repointed ${counts.repointed}, stale ${counts.stale}${ranToCompletion ? " (expected 0 stale)" : ""}`,
	);
	console.log(
		`bench: wrong balance ${counts.wrong_balance} (expected 0)`,
	);
	console.log(
		`bench: shared dataset rows ${counts.shared} (expected ${sharedBefore}, untouched)`,
	);

	const correct =
		Number(counts.holders) === customers &&
		Number(counts.rows) === customers &&
		Number(counts.shared) === sharedBefore &&
		(!ranToCompletion ||
			(Number(counts.stale) === 0 &&
				Number(counts.repointed) === customers &&
				Number(counts.wrong_balance) === 0));
	console.log(correct ? "bench: CORRECT" : "bench: INCORRECT");
	process.exit(correct ? 0 : 1);
};

await main();
