import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { WorkerPhaseResult } from "../../actions/throughWorker/types/workerPhaseResult.js";
import type { PatchPhaseResult } from "./types/patchPhase.js";

export const emptyPatchPhaseResult = (): PatchPhaseResult => ({
	insertedItems: [],
	removedItems: [],
	repointedProducts: [],
	changedInternalCustomerIds: [],
	excludedInternalCustomerIds: [],
	failureReasons: {},
	sqlWrittenWorkerCustomerIds: [],
});

export const workerPhaseToPatchPhase = ({
	worker,
}: {
	worker: WorkerPhaseResult;
}): PatchPhaseResult => ({
	...emptyPatchPhaseResult(),
	insertedItems: worker.insertedItems,
	removedItems: worker.removedItems,
	repointedProducts: worker.repointedProducts,
	changedInternalCustomerIds: worker.repointedProducts.map(
		({ internalCustomerId }) => internalCustomerId,
	),
	excludedInternalCustomerIds: worker.excludedInternalCustomerIds,
	failureReasons: worker.failureReasons,
	sqlWrittenWorkerCustomerIds: worker.sqlWrittenInternalCustomerIds,
});

export const logWorkerPhase = ({
	ctx,
	phase,
	opIndex,
	planId,
	worker,
}: {
	ctx: Pick<AutumnContext, "logger">;
	phase: string;
	opIndex: number;
	planId: string;
	worker: WorkerPhaseResult;
}): void =>
	ctx.logger.debug(`batch-migration: worker ${phase} operations`, {
		data: {
			opIndex,
			planId,
			candidateCount: worker.candidateCount,
			inserted: worker.insertedItems.length,
			removed: worker.removedItems.length,
			repointed: worker.repointedProducts.length,
			excluded: worker.excludedInternalCustomerIds.length,
			failed: Object.keys(worker.failureReasons).length,
		},
	});
