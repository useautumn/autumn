import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listCustomersOnPlanFilterMatchedProducts } from "../repos/index.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
import { addCustomerEntitlementsForPage } from "./sql/index.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "./types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "./utils/batchMigrationExecutionConstants.js";

/**
 * Executes one claimed page in a single transaction: every patch's add ops
 * (scoped to the patch's from-product), then the set-based status marks.
 * Commit makes mutations and `succeeded` marks visible atomically; a crash
 * rolls the page back to `running`, and every statement is replay-idempotent.
 */
export const executeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	plan,
	customers,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
}): Promise<BatchMigrationPageResult> => {
	if (customers.length === 0) return { succeeded: [], skipped: [] };

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const planFilterMatchedProductIds = [
		...new Set(plan.patches.map((patch) => patch.fromInternalProductId)),
	];
	const now = Date.now();

	const matchedInternalIds = await withStatementTimeout(
		ctx.db,
		async (transaction) => {
			const matched = await listCustomersOnPlanFilterMatchedProducts({
				db: transaction,
				internalCustomerIds: pageInternalIds,
				planFilterMatchedProductIds,
			});
			const matchedIds = [...matched];
			const skippedIds = pageInternalIds.filter((id) => !matched.has(id));

			if (matchedIds.length > 0) {
				for (const patch of plan.patches) {
					for (const add of patch.adds) {
						const affected = await addCustomerEntitlementsForPage({
							db: transaction,
							internalCustomerIds: matchedIds,
							fromInternalProductId: patch.fromInternalProductId,
							add,
							now,
						});
						ctx.logger.debug("batch-migration: add operation", {
							data: {
								opIndex: patch.opIndex,
								planId: patch.planId,
								featureId: add.entitlement.feature.id,
								affected,
							},
						});
					}
				}
			}

			await markPageItemRuns({
				db: transaction,
				migrationInternalId,
				internalCustomerIds: matchedIds,
				status: "succeeded",
			});
			await markPageItemRuns({
				db: transaction,
				migrationInternalId,
				internalCustomerIds: skippedIds,
				status: "skipped",
			});

			return matched;
		},
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	);

	return {
		succeeded: customers.filter((customer) =>
			matchedInternalIds.has(customer.internalId),
		),
		skipped: customers.filter(
			(customer) => !matchedInternalIds.has(customer.internalId),
		),
	};
};
