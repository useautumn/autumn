import { addCustomerEntitlementsForPage } from "../../actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { addCustomerEntitlementsThroughWorker } from "../../actions/addCustomerEntitlementsThroughWorker/addCustomerEntitlementsThroughWorker.js";
import { BATCH_MIGRATION_FEATURE_OP_CONCURRENCY } from "../utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";
import type { PatchPhaseArgs, PatchPhaseResult } from "./types/patchPhase.js";
import {
	logWorkerPhase,
	workerPhaseToPatchPhase,
} from "./workerPhaseToPatchPhase.js";

export const runPatchAdds = async ({
	ctx,
	migrationRunId,
	workerGate,
	patch,
	sqlInternalCustomerIds,
	workerCustomers,
	now,
	phases,
}: PatchPhaseArgs): Promise<PatchPhaseResult> => {
	const addInPostgres = ({
		internalCustomerIds,
	}: {
		internalCustomerIds: string[];
	}) =>
		mapWithConcurrency({
			items: patch.addEntitlementOps,
			concurrency: BATCH_MIGRATION_FEATURE_OP_CONCURRENCY,
			run: (add) =>
				addCustomerEntitlementsForPage({
					db: ctx.db,
					scope: patch.scope,
					internalCustomerIds,
					fromProduct: patch.fromProduct,
					add,
					now,
					phases,
				}),
		});

	const [sqlResults, worker] = await Promise.all([
		addInPostgres({ internalCustomerIds: sqlInternalCustomerIds }),
		addCustomerEntitlementsThroughWorker({
			ctx,
			migrationRunId,
			gate: workerGate,
			patch,
			customers: workerCustomers,
			now,
			phases,
		}),
	]);
	const fallbackIds = worker.fallbackInternalCustomerIds;
	const fallbackResults =
		fallbackIds.length === 0
			? []
			: await addInPostgres({ internalCustomerIds: fallbackIds });
	const postgresResults = [...sqlResults, ...fallbackResults];

	for (const [index, add] of patch.addEntitlementOps.entries()) {
		const result = sqlResults[index];
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
	logWorkerPhase({
		ctx,
		phase: "add",
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
		excludedInternalCustomerIds: [
			...postgresResults.flatMap(
				({ excludedInternalCustomerIds }) => excludedInternalCustomerIds,
			),
			...fromWorker.excludedInternalCustomerIds,
		],
	};
};
