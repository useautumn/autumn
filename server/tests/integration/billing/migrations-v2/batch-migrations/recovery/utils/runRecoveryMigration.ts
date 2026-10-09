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
}: {
	ctx: AutumnContext;
	migration: Migration;
	retryFailed?: boolean;
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
