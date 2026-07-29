/**
 * Benchmarks the batch migration lane end to end against the seeded bench org,
 * driving the production path page by page for per-page timings:
 * prepareMigration → shouldRunBatchLane → runBatchMigrationChunk(maxPages: 1).
 *
 *   bun tests/perf/batch-migrations/benchRunMigration.ts --plan bench-free --item words --pages 1
 *   bun tests/perf/batch-migrations/benchRunMigration.ts --plan bench-free --item words --pages all
 *   bun tests/perf/batch-migrations/benchRunMigration.ts --cleanup --item words
 *
 * --cleanup removes previously bench-added entitlement rows + bench item runs
 * so a rerun measures fresh inserts instead of dedup no-ops.
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

import { BENCH_ITEMS } from "./utils/benchMigrationDefs.js";

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	const pagesArg = get("--pages") ?? "1";
	return {
		plan: get("--plan") ?? BENCH_FREE_PRODUCT_ID,
		item: get("--item") ?? "words",
		pages: pagesArg === "all" ? Number.POSITIVE_INFINITY : Number(pagesArg),
		cleanup: args.includes("--cleanup"),
	};
};

const main = async () => {
	const { plan, item, pages, cleanup } = parseArgs();
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;

	const itemParams = BENCH_ITEMS[item];
	if (!itemParams) throw new Error(`bench: unknown item "${item}"`);

	// Every run starts from a clean slate: remove prior bench-added rows so
	// the run measures fresh inserts, never dedup no-ops.
	const cleanupStarted = Date.now();
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
			AND feature_id = ${item}
			AND id NOT LIKE 'ce_bench_%'
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
	`);
	console.log(`bench: pre-run cleanup done in ${Date.now() - cleanupStarted}ms`);
	if (cleanup) process.exit(0);

	// Fresh migration row per run: a new internal_id means claims start clean,
	// while the feature-level dedup still suppresses already-added rows.
	const migrationId = `bench-mig-${plan}-${item}`;
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
				customer: { plan: { plan_id: plan } },
			}),
			operations: OperationsSchema.parse({
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan },
						customize: { add_items: [itemParams] },
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
	console.log(
		`bench: plan=${plan} item=${item} pages=${pages === Number.POSITIVE_INFINITY ? "all" : pages} run=${migrationRunId}`,
	);

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
	let totalSucceeded = 0;
	let totalSkipped = 0;
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
			totalSucceeded += result.summary.succeeded;
			totalSkipped += result.summary.skipped;
			const perCustomerMs = result.processed > 0 ? pageMs / result.processed : 0;
			console.log(
				`bench: page ${page} — ${result.processed.toLocaleString()} customers in ${pageMs}ms (${perCustomerMs.toFixed(3)}ms/customer)`,
			);
			const phaseBreakdown = Object.entries(result.summary.phases)
				.sort(([, a], [, b]) => b - a)
				.map(([phase, ms]) => `${phase}=${ms}ms`)
				.join(" ");
			if (phaseBreakdown) console.log(`bench:   phases: ${phaseBreakdown}`);
		}

		cursor = result.cursor ?? undefined;
		if (result.completion !== "slice_complete") break;
	}

	const totalMs = Date.now() - runStarted;
	const avgPageMs =
		pageTimings.length > 0
			? Math.round(pageTimings.reduce((a, b) => a + b, 0) / pageTimings.length)
			: 0;
	console.log("bench: ─────────────────────────────────────────");
	console.log(
		`bench: TOTAL ${totalProcessed.toLocaleString()} customers (${totalSucceeded.toLocaleString()} succeeded, ${totalSkipped.toLocaleString()} skipped)`,
	);
	console.log(
		`bench: ${pageTimings.length} pages in ${totalMs}ms — avg ${avgPageMs}ms/page, ${
			totalMs > 0 ? Math.round((totalProcessed / totalMs) * 1000).toLocaleString() : 0
		} customers/s`,
	);
	process.exit(0);
};

await main();
