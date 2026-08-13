import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { batchMigrationPlanToExecutionPlan } from "@/internal/migrations/v2/batchOperations/compute/index.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import type { BatchMigrationRejection } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { prepareMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { shouldRunBatchLane } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { generateId } from "@/utils/genUtils.js";

export type ScenarioMigrationResult = {
	lane: "batch" | "per_customer";
	rejections: BatchMigrationRejection[];
	pages: number;
	processed: number;
	prepareMs: number;
	runMs: number;
};

/** Drives a migration through the production path and REPORTS the lane rather
 * than exiting on refusal, so a scenario can assert that a guard held. */
export const runScenarioMigration = async ({
	ctx,
	migration,
	maxPages = Number.POSITIVE_INFINITY,
}: {
	ctx: AutumnContext;
	migration: Migration;
	maxPages?: number;
}): Promise<ScenarioMigrationResult> => {
	const migrationRunId = generateId("bench_run");
	const prepareStarted = Date.now();
	const preparedMigration = await prepareMigration({
		ctx,
		migration,
		dryRun: false,
	});
	const prepareMs = Date.now() - prepareStarted;

	const batchLane = await shouldRunBatchLane({
		ctx,
		migration: preparedMigration,
		migrationRunId,
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});

	if (!batchLane.shouldRun) {
		return {
			lane: "per_customer",
			rejections: batchLane.rejections ?? [],
			pages: 0,
			processed: 0,
			prepareMs,
			runMs: 0,
		};
	}

	const executionPlan = batchMigrationPlanToExecutionPlan({
		plan: batchLane.plan,
	});

	let cursor: string | undefined;
	let pages = 0;
	let processed = 0;
	const runStarted = Date.now();

	while (pages < maxPages) {
		const result = await runBatchMigrationChunk({
			ctx,
			migration: preparedMigration,
			migrationRunId,
			plan: executionPlan,
			afterInternalId: cursor,
			maxPages: 1,
		});
		pages += 1;
		processed += result.summary.succeeded + result.summary.skipped;
		if (!result.cursor) break;
		cursor = result.cursor;
	}

	return {
		lane: "batch",
		rejections: [],
		pages,
		processed,
		prepareMs,
		runMs: Date.now() - runStarted,
	};
};
