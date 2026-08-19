/**
 * Benchmarks a Fanout-shaped batch migration against the DEV bench org:
 * one free plan, six monthly metered replaces, page size 5,000.
 *
 * Infisical can scrub env, so --op-concurrency is written onto
 * BATCH_MIGRATION_FEATURE_OP_CONCURRENCY before migration modules load.
 *
 *   infisical run --env=dev --recursive -- bun <path> --customers 20000 --op-concurrency 1
 *   infisical run --env=dev --recursive -- bun <path> --cleanup
 */

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "all";
	return {
		customers: Number(get("--customers") ?? "20000"),
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		cleanup: args.includes("--cleanup"),
		opConcurrency: Number(
			get("--op-concurrency") ??
				process.env.BATCH_MIGRATION_FEATURE_OP_CONCURRENCY ??
				"3",
		),
	};
};

const args = parseArgs();
process.env.BATCH_MIGRATION_FEATURE_OP_CONCURRENCY = String(
	args.opConcurrency,
);

const REPORT_PHASES = [
	"claim_select",
	"distinct",
	"candidates",
	"replace",
	"marks",
	"finalize",
] as const;

const median = (values: number[]) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const avg = (values: number[]) =>
	values.length === 0
		? 0
		: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

const formatPhases = (phases: Record<string, number>) =>
	Object.entries(phases)
		.sort(([, a], [, b]) => b - a)
		.map(([phase, ms]) => `${phase}=${ms}ms`)
		.join(" ");

const main = async () => {
	const { customers, pages, cleanup, opConcurrency } = args;

	const { migrations, ResetInterval } = await import("@autumn/shared");
	type Migration = import("@autumn/shared").Migration;
	const { MigrationFilterSchema } = await import(
		"@autumn/shared/api/migrations/filters/migrationFilter.js"
	);
	const { OperationsSchema } = await import(
		"@autumn/shared/api/migrations/operations/operations.js"
	);
	const { sql } = await import("drizzle-orm");
	const { BATCH_MIGRATION_FEATURE_OP_CONCURRENCY } = await import(
		"@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js"
	);
	const { batchMigrationPlanToExecutionPlan } = await import(
		"@/internal/migrations/v2/batchOperations/compute/index.js"
	);
	const { runBatchMigrationChunk } = await import(
		"@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js"
	);
	const { prepareMigration } = await import(
		"@/internal/migrations/v2/run/runMigration.js"
	);
	const { shouldRunBatchLane } = await import(
		"@/internal/migrations/v2/utils/shouldRunBatchLane.js"
	);
	const { generateId } = await import("@/utils/genUtils.js");
	const { BENCH_CUSTOMER_ENTITLEMENT_PREFIX, getBenchContext } = await import(
		"./utils/benchContext.js"
	);
	const {
		BENCH_FANOUT_PREFIXES,
		FANOUT_SHAPE_FROM_INCLUDED,
		FANOUT_SHAPE_TO_INCLUDED,
		ensureBenchFanoutShapeProduct,
		resolveFanoutShapeFeatures,
		seedBenchFanoutShape,
	} = await import("./utils/seedBenchFanoutShape.js");

	if (BATCH_MIGRATION_FEATURE_OP_CONCURRENCY !== opConcurrency) {
		console.error(
			`bench: concurrency mismatch — flag/env ${opConcurrency}, constant ${BATCH_MIGRATION_FEATURE_OP_CONCURRENCY}`,
		);
		process.exit(1);
	}
	console.log(
		`bench: feature-op concurrency ${BATCH_MIGRATION_FEATURE_OP_CONCURRENCY}`,
	);

	const { ctx, org } = await getBenchContext();
	const { db } = ctx;
	const prefixes = BENCH_FANOUT_PREFIXES;
	const features = resolveFanoutShapeFeatures({
		features: ctx.features,
		prefixes,
	});

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
	console.log(`bench: cleanup done in ${Date.now() - cleanupStarted}ms`);
	if (cleanup) {
		await db.execute(sql`
			DELETE FROM customers
			WHERE internal_id LIKE ${`${prefixes.internalCustomer}%`}
		`);
		process.exit(0);
	}

	const { internalProductId } = await ensureBenchFanoutShapeProduct({
		db,
		orgId: org.id,
		env: ctx.env,
		features,
		prefixes,
	});

	const seedStarted = Date.now();
	await seedBenchFanoutShape({
		db,
		count: customers,
		planInternalProductId: internalProductId,
		features,
		startsAt: Date.now(),
		orgId: org.id,
		env: ctx.env,
		prefixes,
	});
	console.log(
		`bench: seeded ${customers.toLocaleString()} customers × ${features.length} features in ${Date.now() - seedStarted}ms`,
	);

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

	const migrationId = "bench-mig-fanout-shape";
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
							add_items: features.map((feature) => ({
								feature_id: feature.featureId,
								included: FANOUT_SHAPE_TO_INCLUDED,
								reset: { interval: ResetInterval.Month },
							})),
							remove_items: features.map((feature) => ({
								feature_id: feature.featureId,
							})),
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
	const replaceFeatureIds = replaceOps.map(
		(op) => op.entitlement.feature.id,
	);
	if (replaceOps.length !== features.length) {
		console.error(
			`bench: expected ${features.length} replace ops, got ${replaceOps.length}`,
			{
				replaceFeatureIds,
				adds: executionPlan.patches.flatMap((p) => p.addEntitlementOps).length,
				removes: executionPlan.patches.flatMap((p) => p.removeEntitlementOps)
					.length,
			},
		);
		process.exit(1);
	}
	console.log(`bench: prepare ${prepareMs}ms, lane decision ${laneMs}ms`);
	console.log(
		`bench: replace ops ${replaceOps.length} (${FANOUT_SHAPE_FROM_INCLUDED} → ${FANOUT_SHAPE_TO_INCLUDED}): ${replaceFeatureIds.join(", ")}`,
	);

	let cursor: string | undefined;
	let page = 0;
	let totalProcessed = 0;
	const pageTimings: Array<{
		page: number;
		wallMs: number;
		phases: Record<string, number>;
	}> = [];
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
			const phases = { ...(result.summary.phases ?? {}) };
			pageTimings.push({ page, wallMs: pageMs, phases });
			totalProcessed += result.processed;
			console.log(
				`bench: page ${page} — ${result.processed.toLocaleString()} customers in ${pageMs}ms`,
			);
			console.log(`bench:   phases: ${formatPhases(phases)}`);
		}

		cursor = result.cursor ?? undefined;
		if (result.completion !== "slice_complete") break;
	}

	const totalMs = Date.now() - runStarted;
	const walls = pageTimings.map((timing) => timing.wallMs);
	const hotPhases = pageTimings.map(
		(timing) =>
			(timing.phases.distinct ?? 0) +
			(timing.phases.candidates ?? 0) +
			(timing.phases.replace ?? 0),
	);
	const impliedHotWall = pageTimings.map(
		(timing) =>
			timing.wallMs -
			(timing.phases.claim_select ?? 0) -
			(timing.phases.marks ?? 0) -
			(timing.phases.finalize ?? 0),
	);

	const rate = totalProcessed / (totalMs / 1000);
	console.log("");
	console.log(
		`bench: ${totalProcessed.toLocaleString()} customers in ${totalMs}ms`,
	);
	console.log(`bench: ${Math.round(rate).toLocaleString()} customers/sec`);
	console.log(
		`bench: page wall — min ${Math.min(...walls)}, avg ${avg(walls)}, median ${median(walls)}, max ${Math.max(...walls)}`,
	);
	for (const phase of REPORT_PHASES) {
		const values = pageTimings.map((timing) => timing.phases[phase] ?? 0);
		console.log(
			`bench: ${phase} — avg ${avg(values)} median ${median(values)}`,
		);
	}
	console.log(
		`bench: replace+candidates+distinct (summed, overlaps accumulate under concurrency) — avg ${avg(hotPhases)} median ${median(hotPhases)}`,
	);
	console.log(
		`bench: implied replace-section wall (page − claim − marks − finalize) — avg ${avg(impliedHotWall)} median ${median(impliedHotWall)}`,
	);

	const expectedCase = sql.join(
		features.map(
			(feature) =>
				sql`WHEN ${feature.featureId} THEN ${feature.expectedBalance}::numeric`,
		),
		sql` `,
	);
	const catalogIds = features.map((feature) => sql`${feature.entitlementId}`);

	const [counts]: Array<{
		holders: string;
		rows: string;
		wrong_balance: string;
		stale: string;
		dup_groups: string;
		shared: string;
	}> = await db.execute(sql`
		SELECT
			(SELECT count(*) FROM customer_products
			 WHERE id LIKE ${`${prefixes.customerProduct}%`}) AS holders,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}) AS rows,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}
			   AND balance IS DISTINCT FROM (
			     CASE feature_id ${expectedCase} END
			   )) AS wrong_balance,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${prefixes.entitlement}%`}
			   AND entitlement_id IN (${sql.join(catalogIds, sql`, `)})) AS stale,
			(SELECT count(*) FROM (
			   SELECT internal_customer_id, feature_id
			   FROM customer_entitlements
			   WHERE id LIKE ${`${prefixes.entitlement}%`}
			   GROUP BY 1, 2
			   HAVING count(*) <> 1
			 ) dups) AS dup_groups,
			(SELECT count(*) FROM customer_entitlements
			 WHERE id LIKE ${`${BENCH_CUSTOMER_ENTITLEMENT_PREFIX}%`}
			   AND id NOT LIKE ${`${prefixes.entitlement}%`}) AS shared
	`);

	const sampleIndexes = [
		1,
		2,
		3,
		Math.max(1, Math.floor(customers / 2)),
		customers,
	];
	const sampleInternalIds = sampleIndexes.map(
		(index) => `${prefixes.internalCustomer}${index}`,
	);
	const sampleIds = sampleInternalIds.map((id) => sql`${id}`);
	const sampleRows: Array<{
		internal_customer_id: string;
		feature_id: string;
		balance: string | null;
		row_count: string;
	}> = await db.execute(sql`
		SELECT
			internal_customer_id,
			feature_id,
			balance::text,
			count(*)::text AS row_count
		FROM customer_entitlements
		WHERE internal_customer_id IN (${sql.join(sampleIds, sql`, `)})
		  AND id LIKE ${`${prefixes.entitlement}%`}
		GROUP BY internal_customer_id, feature_id, balance
		ORDER BY internal_customer_id, feature_id
	`);

	const expectedByFeature = new Map(
		features.map((feature) => [feature.featureId, feature.expectedBalance]),
	);
	let sampleOk = true;
	console.log("");
	console.log(`bench: sample customers ${sampleInternalIds.join(", ")}`);
	for (const sampleId of sampleInternalIds) {
		const rows = sampleRows.filter(
			(row) => row.internal_customer_id === sampleId,
		);
		for (const feature of features) {
			const row = rows.find((candidate) => candidate.feature_id === feature.featureId);
			const balance = Number(row?.balance);
			const rowCount = Number(row?.row_count ?? 0);
			const expected = expectedByFeature.get(feature.featureId);
			const ok = rowCount === 1 && balance === expected;
			if (!ok) sampleOk = false;
			console.log(
				`bench:   ${sampleId} ${feature.featureId} rows=${rowCount} balance=${row?.balance ?? "missing"} expected=${expected} ${ok ? "ok" : "FAIL"}`,
			);
		}
	}

	const ranToCompletion = pages === Number.POSITIVE_INFINITY;
	const expectedRows = customers * features.length;
	console.log("");
	console.log(
		`bench: included ${FANOUT_SHAPE_FROM_INCLUDED} → ${FANOUT_SHAPE_TO_INCLUDED}`,
	);
	console.log(`bench: holders ${counts.holders} (expected ${customers})`);
	console.log(`bench: rows ${counts.rows} (expected ${expectedRows})`);
	console.log(
		`bench: stale catalog pointers ${counts.stale}${ranToCompletion ? " (expected 0)" : ""}`,
	);
	console.log(
		`bench: wrong balance ${counts.wrong_balance}, dup feature groups ${counts.dup_groups}`,
	);
	console.log(
		`bench: shared dataset rows ${counts.shared} (expected ${sharedBefore}, untouched)`,
	);

	const correct =
		sampleOk &&
		Number(counts.holders) === customers &&
		Number(counts.rows) === expectedRows &&
		Number(counts.wrong_balance) === 0 &&
		Number(counts.dup_groups) === 0 &&
		Number(counts.shared) === sharedBefore &&
		(!ranToCompletion || Number(counts.stale) === 0);
	console.log(correct ? "bench: PASS" : "bench: FAIL");
	process.exit(correct ? 0 : 1);
};

await main();

export {};
