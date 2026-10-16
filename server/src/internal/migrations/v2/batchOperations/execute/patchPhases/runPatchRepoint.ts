import { repointCustomerProductsForPage } from "../../actions/repointCustomerProductsForPage/repointCustomerProductsForPage.js";
import { repointCustomerProductsThroughWorker } from "../../actions/repointCustomerProductsThroughWorker/repointCustomerProductsThroughWorker.js";
import type { PatchPhaseArgs, PatchPhaseResult } from "./types/patchPhase.js";
import {
	emptyPatchPhaseResult,
	logWorkerPhase,
	workerPhaseToPatchPhase,
} from "./workerPhaseToPatchPhase.js";

export const runPatchRepoint = async ({
	ctx,
	migrationRunId,
	workerGate,
	patch,
	sqlInternalCustomerIds,
	workerCustomers,
	phases,
}: PatchPhaseArgs): Promise<PatchPhaseResult> => {
	const { repointCustomerProduct } = patch;
	if (!repointCustomerProduct) return emptyPatchPhaseResult();
	const toProduct = patch.toProduct ?? patch.fromProduct;

	const repointInPostgres = ({
		internalCustomerIds,
	}: {
		internalCustomerIds: string[];
	}) =>
		repointCustomerProductsForPage({
			db: ctx.db,
			scope: patch.scope,
			internalCustomerIds,
			toInternalProductId: repointCustomerProduct.toInternalProductId,
		});

	const [primaryRows, worker] = await Promise.all([
		repointInPostgres({ internalCustomerIds: sqlInternalCustomerIds }),
		repointCustomerProductsThroughWorker({
			ctx,
			migrationRunId,
			gate: workerGate,
			patch,
			customers: workerCustomers,
			phases,
		}),
	]);
	const fallbackIds = worker.fallbackInternalCustomerIds;
	const fallbackRows =
		fallbackIds.length === 0
			? []
			: await repointInPostgres({ internalCustomerIds: fallbackIds });
	const sqlRows = [...primaryRows, ...fallbackRows];

	ctx.logger.debug("batch-migration: repoint customer products", {
		data: {
			opIndex: patch.opIndex,
			planId: patch.fromProduct.id,
			affected: sqlRows.length,
		},
	});
	logWorkerPhase({
		ctx,
		phase: "repoint",
		opIndex: patch.opIndex,
		planId: patch.fromProduct.id,
		worker,
	});

	const fromWorker = workerPhaseToPatchPhase({ worker });
	const sqlRepointed = sqlRows.map((row) => ({
		...row,
		fromProduct: patch.fromProduct,
		toProduct,
	}));
	return {
		...fromWorker,
		sqlWrittenWorkerCustomerIds: [
			...fromWorker.sqlWrittenWorkerCustomerIds,
			...fallbackIds,
		],
		repointedProducts: [...sqlRepointed, ...fromWorker.repointedProducts],
		changedInternalCustomerIds: [
			...sqlRows.map(({ internalCustomerId }) => internalCustomerId),
			...fromWorker.changedInternalCustomerIds,
		],
	};
};
