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
 * Executes one claimed page: every patch's add ops (scoped by the patch's
 * OperationScope), then the set-based status marks. Succeeded = customers a
 * patch actually changed (≥1 inserted row); everyone else — out-of-scope OR
 * already converged — is skipped.
 *
 * The unit of atomicity is one candidate BATCH, not the page: ops commit
 * per bounded batch (see runCandidateBatches) and the marks commit in their
 * own transaction. Safe because mutations are dedup-idempotent and the
 * page's claims stay `running` until the marks land — a mid-page failure
 * keeps committed batches and a replay converges the rest.
 */
export const executeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	customers,
	phases,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	phases?: BatchMigrationPagePhases;
}): Promise<BatchMigrationPageResult> => {
	if (customers.length === 0)
		return { succeeded: [], skipped: [], insertedItems: [] };

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = Date.now();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	// Customers a patch cannot serve (e.g. no usable reset anchor) drop
	// from succeeded into skipped — the per-customer lane's territory.
	const excludedIds = new Set<string>();

	for (const patch of plan.patches) {
		for (const add of patch.addEntitlementOps) {
			const result = await addCustomerEntitlementsForPage({
				db: ctx.db,
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
					candidateCount: result.candidateCount,
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
		run: () =>
			withStatementTimeout(
				ctx.db,
				(transaction) =>
					markPageItemRuns({
						db: transaction,
						migrationInternalId,
						migrationRunId,
						succeededInternalCustomerIds: [...succeeded],
						skippedInternalCustomerIds: skippedIds,
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
			),
	});

	return {
		succeeded: customers.filter((customer) =>
			succeeded.has(customer.internalId),
		),
		skipped: customers.filter(
			(customer) => !succeeded.has(customer.internalId),
		),
		insertedItems,
	};
};
