import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCustomerEntitlementsForPage } from "../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { listCustomersOnPlanFilterMatchedProducts } from "../repos/index.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
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

	const succeededInternalIds = await withStatementTimeout(
		ctx.db,
		async (transaction) => {
			const matched = await listCustomersOnPlanFilterMatchedProducts({
				db: transaction,
				internalCustomerIds: pageInternalIds,
				planFilterMatchedProductIds,
			});
			const matchedIds = [...matched];
			// Customers a patch cannot serve (e.g. no usable reset anchor) drop
			// from succeeded into skipped — the per-customer lane's territory.
			const excludedIds = new Set<string>();

			if (matchedIds.length > 0) {
				for (const patch of plan.patches) {
					for (const add of patch.addEntitlementOps) {
						const result = await addCustomerEntitlementsForPage({
							db: transaction,
							internalCustomerIds: matchedIds,
							fromInternalProductId: patch.fromInternalProductId,
							add,
							now,
						});
						for (const id of result.excludedInternalCustomerIds) {
							excludedIds.add(id);
						}
						ctx.logger.debug("batch-migration: add operation", {
							data: {
								opIndex: patch.opIndex,
								planId: patch.planId,
								featureId: add.entitlement.feature.id,
								affected: result.affected,
								excluded: result.excludedInternalCustomerIds.length,
							},
						});
					}
				}
			}

			const succeeded = new Set(
				matchedIds.filter((id) => !excludedIds.has(id)),
			);
			const skippedIds = pageInternalIds.filter((id) => !succeeded.has(id));

			await markPageItemRuns({
				db: transaction,
				migrationInternalId,
				internalCustomerIds: [...succeeded],
				status: "succeeded",
			});
			await markPageItemRuns({
				db: transaction,
				migrationInternalId,
				internalCustomerIds: skippedIds,
				status: "skipped",
			});

			return succeeded;
		},
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
	);

	return {
		succeeded: customers.filter((customer) =>
			succeededInternalIds.has(customer.internalId),
		),
		skipped: customers.filter(
			(customer) => !succeededInternalIds.has(customer.internalId),
		),
	};
};
