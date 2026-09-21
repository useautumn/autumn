import { MigrationItemRunSkipReason } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withMigrationBatchResult } from "../../repos/migrationBatchResult/withMigrationBatchResult.js";
import { addCustomerEntitlementsForPage } from "../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { listScopedInternalCustomerIds } from "../actions/listScopedInternalCustomerIds/listScopedInternalCustomerIds.js";
import { removeCustomerEntitlementsForPage } from "../actions/removeCustomerEntitlementsForPage/removeCustomerEntitlementsForPage.js";
import { replaceCustomerEntitlementsForPage } from "../actions/replaceCustomerEntitlementsForPage/replaceCustomerEntitlementsForPage.js";
import { repointCustomerProductsForPage } from "../actions/repointCustomerProductsForPage/repointCustomerProductsForPage.js";
import { runLicenseEntitlementOp } from "../actions/runLicenseEntitlementOp.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { markPageItemRuns } from "./claim/index.js";
import { assertMigrationPageRecovery } from "./recovery/assertMigrationPageRecovery.js";
import { compactToRepointBatchResult } from "./recovery/compactResults/compactToRepointBatchResult.js";
import { repointBatchResultToCompact } from "./recovery/compactResults/repointBatchResultToCompact.js";
import { getMigrationOperationId } from "./recovery/getMigrationOperationId.js";
import type { MigrationPageRecovery } from "./recovery/types/migrationPageRecovery.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "./types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "./utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "./utils/mapWithConcurrency.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

// SQL batches commit independently; recovery preserves their original results.
// Retries must supply the original plan, customers, page identity and timestamp.
export const executeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	customers,
	phases,
	recovery,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	phases?: BatchMigrationPagePhases;
	recovery?: MigrationPageRecovery;
}): Promise<BatchMigrationPageResult> => {
	assertMigrationPageRecovery({ plan, recovery });

	if (customers.length === 0)
		return {
			succeeded: [],
			skipped: [],
			skipReasons: {},
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
		};

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = recovery?.effectiveAt ?? Date.now();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];
	const repointedProducts: BatchMigrationRepointedProduct[] = [];
	// Customers a patch cannot serve (e.g. no usable reset anchor) drop
	// from succeeded into skipped — the per-customer lane's territory.
	const excludedIds = new Set<string>();
	const repointedIds = new Set<string>();

	for (const [patchIndex, patch] of plan.patches.entries()) {
		// Op types stay ordered (removes, then replaces, then adds) but ops
		// WITHIN a type run concurrently: each op owns one feature, and
		// different features touch disjoint customer_entitlements rows.
		// Results merge in op order so output stays deterministic.

		// Removes run first: an add landing before its sibling remove would be
		// dropped again by a filter matching the same feature.
		const removeResults = await mapWithConcurrency({
			items: patch.removeEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (remove) =>
				removeCustomerEntitlementsForPage({
					db: ctx.db,
					features: ctx.features,
					scope: patch.scope,
					internalCustomerIds: pageInternalIds,
					fromProduct: patch.fromProduct,
					remove,
					phases,
				}),
		});
		for (const [index, remove] of patch.removeEntitlementOps.entries()) {
			const result = removeResults[index];
			removedItems.push(...result.removedItems);
			ctx.logger.debug("batch-migration: remove operation", {
				data: {
					opIndex: patch.opIndex,
					planId: patch.fromProduct.id,
					featureId: remove.from.feature_id,
					candidateCount: result.candidateCount,
					affected: result.affected,
				},
			});
		}

		// Replaces run before adds so the add dedup sees post-replace definitions.
		const replaceResults = await mapWithConcurrency({
			items: patch.replaceEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (replace) =>
				replaceCustomerEntitlementsForPage({
					db: ctx.db,
					features: ctx.features,
					scope: patch.scope,
					internalCustomerIds: pageInternalIds,
					fromProduct: patch.fromProduct,
					replace,
					now,
					phases,
				}),
		});
		for (const [index, replace] of patch.replaceEntitlementOps.entries()) {
			const result = replaceResults[index];
			for (const id of result.excludedInternalCustomerIds) {
				excludedIds.add(id);
			}
			insertedItems.push(...result.insertedItems);
			removedItems.push(...result.removedItems);
			ctx.logger.debug("batch-migration: replace operation", {
				data: {
					opIndex: patch.opIndex,
					planId: patch.fromProduct.id,
					fromFeatureId: replace.from.feature_id,
					featureId: replace.entitlement.feature.id,
					candidateCount: result.candidateCount,
					affected: result.affected,
					excluded: result.excludedInternalCustomerIds.length,
				},
			});
		}

		const addResults = await mapWithConcurrency({
			items: Array.from(patch.addEntitlementOps.entries()),
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: ([addIndex, add]) =>
				addCustomerEntitlementsForPage({
					db: ctx.db,
					scope: patch.scope,
					internalCustomerIds: pageInternalIds,
					fromProduct: patch.fromProduct,
					add,
					now,
					phases,
					operationId: getMigrationOperationId({
						migrationRunId,
						pageId: recovery?.pageId,
						patchIndex,
						operation: { type: "add", index: addIndex },
					}),
				}),
		});
		for (const [index, add] of patch.addEntitlementOps.entries()) {
			const result = addResults[index];
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

		// License ops stay sequential: two ops can target the same
		// licensePlanId pool, so their rows are not disjoint.
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
			const input = {
				scope: patch.scope,
				internalCustomerIds: pageInternalIds.filter(
					(id) => !excludedIds.has(id),
				),
				toInternalProductId: patch.repointCustomerProduct.toInternalProductId,
			};
			const operationId = getMigrationOperationId({
				migrationRunId,
				pageId: recovery?.pageId,
				patchIndex,
				operation: { type: "repoint" },
			});
			const { rows } = await withMigrationBatchResult({
				ctx,
				recovery:
					operationId === undefined
						? undefined
						: {
								orgId: ctx.org.id,
								env: ctx.env,
								batchId: JSON.stringify([
									"repoint-customer-products",
									operationId,
								]),
								input,
								resultStorage: {
									toStored: repointBatchResultToCompact,
									fromStored: compactToRepointBatchResult,
								},
							},
				execute: async ({ ctx }) => ({
					rows: await repointCustomerProductsForPage({ db: ctx.db, ...input }),
				}),
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
	const skipReasons = await resolveSkipReasons({
		ctx,
		plan,
		skippedIds,
		excludedIds,
	});
	const noUpdatesNeededIds = skippedIds.filter(
		(id) => skipReasons[id] === MigrationItemRunSkipReason.NoUpdatesNeeded,
	);
	const ineligibleIds = skippedIds.filter(
		(id) => skipReasons[id] === MigrationItemRunSkipReason.Ineligible,
	);

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
						noUpdatesNeededInternalCustomerIds: noUpdatesNeededIds,
						ineligibleInternalCustomerIds: ineligibleIds,
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
		skipReasons,
		insertedItems,
		removedItems,
		repointedProducts,
	};
};

/** Skipped with a product in scope = already converged; otherwise ineligible. */
const resolveSkipReasons = async ({
	ctx,
	plan,
	skippedIds,
	excludedIds,
}: {
	ctx: AutumnContext;
	plan: BatchMigrationExecutionPlan;
	skippedIds: string[];
	excludedIds: Set<string>;
}): Promise<Record<string, MigrationItemRunSkipReason>> => {
	if (skippedIds.length === 0) return {};
	const scopedIds = await listScopedInternalCustomerIds({
		db: ctx.db,
		internalCustomerIds: skippedIds,
		scopes: plan.patches.map((patch) => patch.scope),
	});
	return Object.fromEntries(
		skippedIds.map((id) => [
			id,
			!excludedIds.has(id) && scopedIds.has(id)
				? MigrationItemRunSkipReason.NoUpdatesNeeded
				: MigrationItemRunSkipReason.Ineligible,
		]),
	);
};
