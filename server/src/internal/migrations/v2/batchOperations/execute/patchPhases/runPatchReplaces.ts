import { replaceCustomerEntitlementsForPage } from "../../actions/replaceCustomerEntitlementsForPage/replaceCustomerEntitlementsForPage.js";
import { BATCH_MIGRATION_FEATURE_OP_CONCURRENCY } from "../utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";
import { fallBackAllWorkerCustomers } from "./fallBackAllWorkerCustomers.js";
import type { PatchPhaseArgs, PatchPhaseResult } from "./types/patchPhase.js";
import {
	logWorkerPhase,
	workerPhaseToPatchPhase,
} from "./workerPhaseToPatchPhase.js";

export const runPatchReplaces = async ({
	ctx,
	patch,
	sqlInternalCustomerIds,
	workerCustomers,
	now,
	phases,
}: PatchPhaseArgs): Promise<PatchPhaseResult> => {
	const replaceInPostgres = ({
		internalCustomerIds,
	}: {
		internalCustomerIds: string[];
	}) =>
		mapWithConcurrency({
			items: patch.replaceEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (replace) =>
				replaceCustomerEntitlementsForPage({
					db: ctx.db,
					features: ctx.features,
					scope: patch.scope,
					internalCustomerIds,
					fromProduct: patch.fromProduct,
					replace,
					now,
					phases,
				}),
		});

	const [sqlResults, worker] = await Promise.all([
		replaceInPostgres({ internalCustomerIds: sqlInternalCustomerIds }),
		fallBackAllWorkerCustomers({ customers: workerCustomers }),
	]);
	const fallbackIds = worker.fallbackInternalCustomerIds;
	const fallbackResults =
		fallbackIds.length === 0
			? []
			: await replaceInPostgres({ internalCustomerIds: fallbackIds });
	const postgresResults = [...sqlResults, ...fallbackResults];

	for (const [index, replace] of patch.replaceEntitlementOps.entries()) {
		const result = sqlResults[index];
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
	logWorkerPhase({
		ctx,
		phase: "replace",
		opIndex: patch.opIndex,
		planId: patch.fromProduct.id,
		worker,
	});

	const fromWorker = workerPhaseToPatchPhase({ worker });
	return {
		...fromWorker,
		sqlWrittenWorkerCustomerIds: [
			...fromWorker.sqlWrittenWorkerCustomerIds,
			...fallbackIds,
		],
		insertedItems: [
			...postgresResults.flatMap(({ insertedItems }) => insertedItems),
			...fromWorker.insertedItems,
		],
		removedItems: [
			...postgresResults.flatMap(({ removedItems }) => removedItems),
			...fromWorker.removedItems,
		],
		excludedInternalCustomerIds: [
			...postgresResults.flatMap(
				({ excludedInternalCustomerIds }) => excludedInternalCustomerIds,
			),
			...fromWorker.excludedInternalCustomerIds,
		],
	};
};
