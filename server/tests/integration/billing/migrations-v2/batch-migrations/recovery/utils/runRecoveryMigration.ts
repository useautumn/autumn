import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";

/** One in-process run with webhooks on; a failed run returns its error so the
 * test can assert what the failure left behind. Imported lazily so the page
 * fault mock is installed first. */
export const runRecoveryMigration = async ({
	ctx,
	migration,
	retryFailed = false,
	only,
}: {
	ctx: AutumnContext;
	migration: Migration;
	retryFailed?: boolean;
	only?: string[];
}) => {
	const { runMigrationInChunks } = await import(
		"@/internal/migrations/v2/run/runMigrationInChunks.js"
	);
	const migrationRunId = generateId("mrun");
	const outcome = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
		controls: {
			webhooks: { sendWebhooks: true },
			...(only ? { only } : {}),
			...(retryFailed ? { retryItemStatuses: ["failed" as const] } : {}),
		},
	}).then(
		(result) => ({ result, error: undefined }),
		(error: unknown) => ({ result: undefined, error }),
	);
	return { migrationRunId, ...outcome };
};

export const updatePlanAddingItems = ({
	planId,
	addItems,
}: {
	planId: string;
	addItems: { feature_id: string; included?: number }[];
}) => ({
	type: "update_plan" as const,
	plan_filter: { plan_id: planId },
	customize: { add_items: addItems },
});

/** The batch plan a run of this migration executes, for driving one batch
 * step (such as the publish sweep) directly. */
export const computeBatchExecutionPlan = async ({
	ctx,
	migration,
}: {
	ctx: AutumnContext;
	migration: Migration;
}) => {
	const { prepareMigration } = await import(
		"@/internal/migrations/v2/run/runMigration.js"
	);
	const { shouldRunBatchLane } = await import(
		"@/internal/migrations/v2/utils/shouldRunBatchLane.js"
	);
	const { batchMigrationPlanToExecutionPlan } = await import(
		"@/internal/migrations/v2/batchOperations/compute/index.js"
	);
	const batchLane = await shouldRunBatchLane({
		ctx,
		migration: await prepareMigration({ ctx, migration, dryRun: false }),
		migrationRunId: generateId("mrun"),
		dryRun: false,
		controls: undefined,
		hasCustomHooks: false,
		hasCloudBatchAdapter: false,
	});
	if (!batchLane.shouldRun)
		throw new Error("expected the migration to be batch-eligible");
	return batchMigrationPlanToExecutionPlan({ plan: batchLane.plan });
};
