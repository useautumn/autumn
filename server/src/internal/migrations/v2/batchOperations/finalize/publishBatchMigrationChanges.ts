import { MigrationItemRunStatus } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookControls } from "@/internal/migrations/v2/cloudAdapter/types.js";
import { queueMigrationWebhooks } from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";
import {
	clearPublishedItemRunChanges,
	type ItemRunsToPublishScope,
	listItemRunsToPublish,
} from "../execute/claim/index.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../execute/utils/batchMigrationExecutionConstants.js";
import { itemRunsToPageResult } from "../itemChanges/itemRunsToPageResult.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { buildBatchMigrationWebhookRecords } from "./buildBatchMigrationWebhookRecords.js";
import { emitBatchMigrationItemEvents } from "./emitBatchMigrationItemEvents.js";
import { invalidateBatchMigrationCaches } from "./invalidateBatchMigrationCaches.js";

/** The one path from committed changes to their effects, for a page and a sweep
 * alike. Only settled item runs publish and clear; unsettled ones get the cache bust. */
export const publishBatchMigrationChanges = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	webhooks,
	scope,
	invalidateSkipped = false,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	webhooks?: MigrationWebhookControls;
	scope: ItemRunsToPublishScope;
	/** Also bust skipped customers: rows that failed before changes were
	 * recorded can be converged yet still cached stale. */
	invalidateSkipped?: boolean;
}): Promise<void> => {
	const itemRuns = await withStatementTimeout(
		ctx.db,
		(db) => listItemRunsToPublish({ db, migrationInternalId, scope }),
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	);
	const pageResult = await itemRunsToPageResult({ ctx, plan, itemRuns });

	await invalidateBatchMigrationCaches({
		ctx,
		customers: itemRuns
			.filter(
				(itemRun) =>
					itemRun.changes !== null ||
					(invalidateSkipped &&
						itemRun.status === MigrationItemRunStatus.Skipped),
			)
			.map((itemRun) => itemRun.customer),
	});
	await emitBatchMigrationItemEvents({
		ctx,
		migrationInternalId,
		migrationRunId,
		plan,
		pageResult,
	});
	if (webhooks?.sendWebhooks)
		await queueMigrationWebhooks({
			ctx,
			migrationRunId,
			controls: webhooks,
			records: buildBatchMigrationWebhookRecords({
				pageResult,
				plan,
				features: ctx.features,
			}),
		});

	const published = itemRuns.filter(
		(itemRun) => itemRun.changes !== null && isSettled(itemRun.status),
	);
	await withStatementTimeout(
		ctx.db,
		(db) =>
			clearPublishedItemRunChanges({
				db,
				migrationInternalId,
				internalCustomerIds: published.map(
					(itemRun) => itemRun.customer.internalId,
				),
			}),
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	);
};

const isSettled = (status: MigrationItemRunStatus) =>
	status === MigrationItemRunStatus.Succeeded ||
	status === MigrationItemRunStatus.Skipped;
