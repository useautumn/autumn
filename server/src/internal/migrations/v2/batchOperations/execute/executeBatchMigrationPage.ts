import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCustomerEntitlementsForPage } from "../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { removeCustomerEntitlementsForPage } from "../actions/removeCustomerEntitlementsForPage/removeCustomerEntitlementsForPage.js";
import { replaceCustomerEntitlementsForPage } from "../actions/replaceCustomerEntitlementsForPage/replaceCustomerEntitlementsForPage.js";
import { repointCustomerProductsForPage } from "../actions/repointCustomerProductsForPage/repointCustomerProductsForPage.js";
import { runLicenseEntitlementOp } from "../actions/runLicenseEntitlementOp.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "./types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "./utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

/**
 * Executes one claimed page: every patch's ops (scoped by the patch's
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
		return {
			succeeded: [],
			skipped: [],
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
		};

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = Date.now();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];
	const repointedProducts: BatchMigrationRepointedProduct[] = [];
	// Customers a patch cannot serve (e.g. no usable reset anchor) drop
	// from succeeded into skipped — the per-customer lane's territory.
	const excludedIds = new Set<string>();
	const repointedIds = new Set<string>();

	for (const patch of plan.patches) {
		// Removes run first: an add landing before its sibling remove would be
		// dropped again by a filter matching the same feature.
		for (const remove of patch.removeEntitlementOps) {
			const result = await removeCustomerEntitlementsForPage({
				db: ctx.db,
				features: ctx.features,
				scope: patch.scope,
				internalCustomerIds: pageInternalIds,
				fromProduct: patch.fromProduct,
				remove,
				phases,
			});
			removedItems.push(...result.removedItems);
			ctx.logger.debug("batch-migration: remove operation", {
				data: {
					opIndex: patch.opIndex,
					planId: patch.fromProduct.id,
					featureId: remove.entitlement.feature.id,
					candidateCount: result.candidateCount,
					affected: result.affected,
				},
			});
		}

		// Replaces run before adds so the add dedup sees post-replace definitions.
		for (const replace of patch.replaceEntitlementOps) {
			const result = await replaceCustomerEntitlementsForPage({
				db: ctx.db,
				features: ctx.features,
				scope: patch.scope,
				internalCustomerIds: pageInternalIds,
				fromProduct: patch.fromProduct,
				replace,
				now,
				phases,
			});
			for (const id of result.excludedInternalCustomerIds) {
				excludedIds.add(id);
			}
			insertedItems.push(...result.insertedItems);
			removedItems.push(...result.removedItems);
			ctx.logger.debug("batch-migration: replace operation", {
				data: {
					opIndex: patch.opIndex,
					planId: patch.fromProduct.id,
					fromFeatureId: replace.fromEntitlement.feature.id,
					featureId: replace.entitlement.feature.id,
					candidateCount: result.candidateCount,
					affected: result.affected,
					excluded: result.excludedInternalCustomerIds.length,
				},
			});
		}

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

		for (const operation of patch.licenseEntitlementOps) {
			const result = await runLicenseEntitlementOp({
				db: ctx.db,
				features: ctx.features,
				scope: patch.scope,
				internalCustomerIds: pageInternalIds,
				operation,
				now,
				phases,
			});
			for (const id of result.excludedInternalCustomerIds) {
				excludedIds.add(id);
			}
			for (const id of result.changedInternalCustomerIds) {
				repointedIds.add(id);
			}
			insertedItems.push(...result.insertedItems);
			removedItems.push(...result.removedItems);
			ctx.logger.debug("batch-migration: license operation", {
				data: {
					opIndex: patch.opIndex,
					licensePlanId: operation.licensePlanId,
					operation: operation.type,
					inserted: result.insertedItems.length,
					removed: result.removedItems.length,
					excluded: result.excludedInternalCustomerIds.length,
				},
			});
		}

		if (patch.repointCustomerProduct) {
			const rows = await repointCustomerProductsForPage({
				db: ctx.db,
				scope: patch.scope,
				internalCustomerIds: pageInternalIds.filter(
					(id) => !excludedIds.has(id),
				),
				toInternalProductId: patch.repointCustomerProduct.toInternalProductId,
			});
			for (const row of rows) {
				repointedIds.add(row.internalCustomerId);
				repointedProducts.push({
					...row,
					fromProduct: patch.fromProduct,
					toProduct: patch.toProduct ?? patch.fromProduct,
				});
			}
			ctx.logger.debug("batch-migration: repoint customer products", {
				data: {
					opIndex: patch.opIndex,
					planId: patch.fromProduct.id,
					affected: rows.length,
				},
			});
		}
	}

	// A repointed pool or a dropped row is a real change even with nothing
	// inserted; leaving it out of `succeeded` would skip its cache invalidation.
	const succeeded = new Set([
		...insertedItems.map((item) => item.internalCustomerId),
		...removedItems.map((item) => item.internalCustomerId),
		...repointedIds,
	]);
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
				{ forceCustomPlan: true },
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
		removedItems,
		repointedProducts,
	};
};
