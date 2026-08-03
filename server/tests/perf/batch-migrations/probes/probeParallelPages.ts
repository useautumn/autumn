/**
 * Parallel-page scaling experiment: claims 10-page batches (real claim,
 * sequential cursor) then executes them at concurrency 1/2/4/6/10 via the
 * real executeBatchMigrationPage. Sequential baseline runs FIRST and LAST to
 * bound cache-warming skew. Writes to the bench org; revert with
 * revertBenchMigrations.ts.
 *
 *   bun tests/perf/batch-migrations/probes/probeParallelPages.ts
 */

import { sql } from "drizzle-orm";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { claimNextBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/claim/index.js";
import { executeBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/executeBatchMigrationPage.js";
import type { BatchMigrationPagePhases } from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { getMigrationEventInternalId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";
import {
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	getBenchContext,
} from "../utils/benchContext.js";

const MIGRATION_ID = "bench-mig-bench-paid-words";
const PAGES_PER_SCENARIO = 10;
const PAGE_SIZE = 5000;
const CONCURRENCY_SCENARIOS = [1, 2, 4, 6, 10, 1];

const runWithConcurrency = async <T>({
	items,
	concurrency,
	run,
}: {
	items: T[];
	concurrency: number;
	run: (item: T) => Promise<void>;
}) => {
	const queue = [...items];
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (true) {
				const item = queue.shift();
				if (item === undefined) return;
				await run(item);
			}
		},
	);
	await Promise.all(workers);
};

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, org } = bench;
	const { db } = ctx;

	// Fresh slate: remove previously added words rows + bench item runs.
	await db.execute(sql`
		DELETE FROM customer_entitlements
		WHERE internal_customer_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
			AND feature_id = 'words' AND id NOT LIKE 'ce_bench_%'
	`);
	await db.execute(sql`
		DELETE FROM migration_item_runs
		WHERE item_id LIKE ${`${BENCH_INTERNAL_CUSTOMER_PREFIX}%`}
	`);

	const [migrationRow] = (await db.execute(sql`
		SELECT * FROM migrations
		WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${MIGRATION_ID}
	`)) as Record<string, unknown>[];
	if (!migrationRow)
		throw new Error(`run seedBatchBench --migrations-only first (${MIGRATION_ID} missing)`);

	const migrationRunId = generateId("bench_run");
	const preparedMigration = await prepareMigration({
		ctx,
		// biome-ignore lint/suspicious/noExplicitAny: raw row → prepare parses
		migration: migrationRow as any,
		dryRun: false,
	});
	const lane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	if (!lane.shouldRun) throw new Error("batch lane rejected");
	const plan = batchMigrationPlanToExecutionPlan({ plan: lane.plan });
	const migrationInternalId = getMigrationEventInternalId(preparedMigration);

	let cursor: string | undefined;
	for (const concurrency of CONCURRENCY_SCENARIOS) {
		// Claim this scenario's pages (sequential — cursor dependency).
		const claimStarted = Date.now();
		const pages = [];
		for (let i = 0; i < PAGES_PER_SCENARIO; i++) {
			const page = await claimNextBatchMigrationPage({
				ctx,
				migration: preparedMigration,
				migrationInternalId,
				migrationRunId,
				afterInternalId: cursor,
				limit: PAGE_SIZE,
			});
			if (page.selectedCount === 0) break;
			cursor = page.cursor;
			pages.push(page);
		}
		const claimMs = Date.now() - claimStarted;

		const insertTimes: number[] = [];
		const executeStarted = Date.now();
		await runWithConcurrency({
			items: pages,
			concurrency,
			run: async (page) => {
				const phases: BatchMigrationPagePhases = {};
				await executeBatchMigrationPage({
					ctx,
					migrationInternalId,
					plan,
					customers: page.customers,
					phases,
				});
				insertTimes.push(phases.insert ?? 0);
			},
		});
		const executeMs = Date.now() - executeStarted;

		const processed = pages.reduce((sum, p) => sum + p.customers.length, 0);
		const avgInsert = Math.round(
			insertTimes.reduce((a, b) => a + b, 0) / (insertTimes.length || 1),
		);
		console.log(
			`K=${concurrency}: ${pages.length} pages (${processed.toLocaleString()} customers) — claims ${claimMs}ms, exec ${executeMs}ms → ${Math.round((processed / executeMs) * 1000).toLocaleString()} customers/s (avg insert/page ${avgInsert}ms)`,
		);
	}
	process.exit(0);
};

await main();
