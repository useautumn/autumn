import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCustomerEntitlementsForPage } from "../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "./types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "./utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

/**
 * Executes one claimed page in a single transaction: every patch's add ops
 * (scoped by the patch's OperationScope), then the set-based status marks.
 * Succeeded = customers a patch actually changed (≥1 inserted row); everyone
 * else — out-of-scope OR already converged — is skipped. Commit makes
 * mutations and marks visible atomically; a crash rolls the page back to
 * `running`, and every statement is replay-idempotent.
 */
export const executeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	plan,
	customers,
	phases,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	phases?: BatchMigrationPagePhases;
}): Promise<BatchMigrationPageResult> => {
	if (customers.length === 0)
		return { succeeded: [], skipped: [], insertedItems: [] };

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = Date.now();
	const insertedItems: BatchMigrationInsertedItem[] = [];

	const succeededInternalIds = await withStatementTimeout(
		ctx.db,
		async (transaction) => {
			// Customers a patch cannot serve (e.g. no usable reset anchor) drop
			// from succeeded into skipped — the per-customer lane's territory.
			const excludedIds = new Set<string>();

			for (const patch of plan.patches) {
				for (const add of patch.addEntitlementOps) {
					const result = await addCustomerEntitlementsForPage({
						db: transaction,
						scope: patch.scope,
						internalCustomerIds: pageInternalIds,
						fromProduct: patch.fromProduct,
						add,
						now,
						phases,
					});
					for (const id of result.excludedInternalCustomerIds) {
						excludedIds.add(id);
					}
					insertedItems.push(...result.insertedItems);
					ctx.logger.debug("batch-migration: add operation", {
						data: {
							opIndex: patch.opIndex,
							planId: patch.fromProduct.id,
							featureId: add.entitlement.feature.id,
							affected: result.affected,
							excluded: result.excludedInternalCustomerIds.length,
						},
					});
				}
			}

			const succeeded = new Set(
				insertedItems.map((item) => item.internalCustomerId),
			);
			for (const id of excludedIds) succeeded.delete(id);
			const skippedIds = pageInternalIds.filter((id) => !succeeded.has(id));

			await timePhase({
				phases,
				phase: "marks",
				run: async () => {
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
				},
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
		insertedItems,
	};
};
