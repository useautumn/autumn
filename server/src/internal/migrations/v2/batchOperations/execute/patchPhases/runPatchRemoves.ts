import { removeCustomerEntitlementsForPage } from "../../actions/removeCustomerEntitlementsForPage/removeCustomerEntitlementsForPage.js";
import { BATCH_MIGRATION_FEATURE_OP_CONCURRENCY } from "../utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";
import { fallBackAllWorkerCustomers } from "./fallBackAllWorkerCustomers.js";
import type { PatchPhaseArgs, PatchPhaseResult } from "./types/patchPhase.js";
import {
	logWorkerPhase,
	workerPhaseToPatchPhase,
} from "./workerPhaseToPatchPhase.js";

export const runPatchRemoves = async ({
	ctx,
	patch,
	sqlInternalCustomerIds,
	workerCustomers,
	phases,
}: PatchPhaseArgs): Promise<PatchPhaseResult> => {
	const removeInPostgres = ({
		internalCustomerIds,
	}: {
		internalCustomerIds: string[];
	}) =>
		mapWithConcurrency({
			items: patch.removeEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (remove) =>
				removeCustomerEntitlementsForPage({
					db: ctx.db,
					features: ctx.features,
					scope: patch.scope,
					internalCustomerIds,
					fromProduct: patch.fromProduct,
					remove,
					phases,
				}),
		});

	const [sqlResults, worker] = await Promise.all([
		removeInPostgres({ internalCustomerIds: sqlInternalCustomerIds }),
		fallBackAllWorkerCustomers({ customers: workerCustomers }),
	]);
	const fallbackIds = worker.fallbackInternalCustomerIds;
	const fallbackResults =
		fallbackIds.length === 0
			? []
			: await removeInPostgres({ internalCustomerIds: fallbackIds });
	const postgresResults = [...sqlResults, ...fallbackResults];

	for (const [index, remove] of patch.removeEntitlementOps.entries()) {
		const result = sqlResults[index];
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
	logWorkerPhase({
		ctx,
		phase: "remove",
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
		removedItems: [
			...postgresResults.flatMap(({ removedItems }) => removedItems),
			...fromWorker.removedItems,
		],
	};
};
