import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookControls } from "@/internal/migrations/v2/cloudAdapter/types.js";
import { listUnpublishedItemRunIds } from "../execute/claim/index.js";
import {
	BATCH_MIGRATION_PAGE_SIZE,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../execute/utils/batchMigrationExecutionConstants.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { publishBatchMigrationChanges } from "./publishBatchMigrationChanges.js";

/** Republishes every change of the migration whose page publish never landed,
 * through the same publisher the pages use. */
export const sweepUnpublishedChanges = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	webhooks,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	webhooks?: MigrationWebhookControls;
}): Promise<void> => {
	let afterInternalId: string | undefined;
	while (true) {
		const internalCustomerIds = await withStatementTimeout(
			ctx.db,
			(db) =>
				listUnpublishedItemRunIds({
					db,
					migrationInternalId,
					afterInternalId,
					limit: BATCH_MIGRATION_PAGE_SIZE,
				}),
			BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		);
		if (internalCustomerIds.length === 0) return;

		await publishBatchMigrationChanges({
			ctx,
			migrationInternalId,
			migrationRunId,
			plan,
			webhooks,
			internalCustomerIds,
		});
		ctx.logger.info("batch-migration: swept unpublished changes", {
			data: { migrationRunId, customers: internalCustomerIds.length },
		});
		afterInternalId = internalCustomerIds[internalCustomerIds.length - 1];
	}
};
