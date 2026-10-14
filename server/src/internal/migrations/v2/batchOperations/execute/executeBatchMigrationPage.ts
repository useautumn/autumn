import { MigrationItemRunSkipReason } from "@autumn/shared";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCustomerEntitlementsForPage } from "../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { listScopedInternalCustomerIds } from "../actions/listScopedInternalCustomerIds/listScopedInternalCustomerIds.js";
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
import {
	BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "./utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "./utils/mapWithConcurrency.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./utils/pagePhaseTimings.js";

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
			skipReasons: {},
			insertedItems: [],
			removedItems: [],
			repointedProducts: [],
		};

	const pageInternalIds = customers.map((customer) => customer.internalId);
	const now = Date.now();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];
	const repointedProducts: BatchMigrationRepointedProduct[] = [];
	const excludedIds = new Set<string>();
	const repointedIds = new Set<string>();

	for (const patch of plan.patches) {
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
			items: patch.addEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (add) =>
				addCustomerEntitlementsForPage({
					db: ctx.db,
					scope: patch.scope,
					internalCustomerIds: pageInternalIds,
					fromProduct: patch.fromProduct,
					add,
					now,
					phases,
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
