import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchMigrationPageResult } from "../types/batchMigrationExecutionTypes.js";

/** Post-commit side effects for one finalized page. SKELETON — the lane must
 * not serve real runs until these land (parity: executeMigrateCustomerPlan). */
export const finalizeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	pageResult,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	pageResult: BatchMigrationPageResult;
}): Promise<void> => {
	// TODO(batch-migrations): bulk Tinybird item events via
	// insertMigrationItemEvents (succeeded + skipped, response { lane: "batch" }).
	// TODO(batch-migrations): deleteCachedFullCustomer per mutated customer,
	// bounded concurrency — per-customer lane does this after every item.
	// TODO(batch-migrations): webhook parity — per-customer lane emits billing
	// webhooks (awaitBillingUpdatedWebhook); decide the batch equivalent.
	// TODO(batch-migrations): verify caches beyond fullCustomer (FullSubject /
	// check path) don't serve stale entitlement sets after the inserts.
	ctx.logger.debug("batch-migration: finalize page (skeleton)", {
		data: {
			migrationInternalId,
			migrationRunId,
			succeeded: pageResult.succeeded.length,
			skipped: pageResult.skipped.length,
		},
	});
};
