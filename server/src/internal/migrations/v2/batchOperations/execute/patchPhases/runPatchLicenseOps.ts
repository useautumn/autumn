import { runLicenseEntitlementOp } from "../../actions/runLicenseEntitlementOp.js";
import type { PatchPhaseArgs, PatchPhaseResult } from "./types/patchPhase.js";
import { emptyPatchPhaseResult } from "./workerPhaseToPatchPhase.js";

export const runPatchLicenseOps = async ({
	ctx,
	patch,
	sqlInternalCustomerIds,
	workerCustomers,
	now,
	phases,
}: PatchPhaseArgs): Promise<PatchPhaseResult> => {
	const workerIds = new Set(
		workerCustomers.map(({ internalId }) => internalId),
	);
	const result = emptyPatchPhaseResult();

	// License ops stay sequential: two ops can target the same
	// licensePlanId pool, so their rows are not disjoint.
	for (const operation of patch.licenseEntitlementOps) {
		const opResult = await runLicenseEntitlementOp({
			db: ctx.db,
			features: ctx.features,
			scope: patch.scope,
			internalCustomerIds: [...sqlInternalCustomerIds, ...workerIds],
			operation,
			now,
			phases,
		});
		result.excludedInternalCustomerIds.push(
			...opResult.excludedInternalCustomerIds,
		);
		result.changedInternalCustomerIds.push(
			...opResult.changedInternalCustomerIds,
		);
		result.insertedItems.push(...opResult.insertedItems);
		result.removedItems.push(...opResult.removedItems);
		ctx.logger.debug("batch-migration: license operation", {
			data: {
				opIndex: patch.opIndex,
				licensePlanId: operation.licensePlanId,
				operation: operation.type,
				inserted: opResult.insertedItems.length,
				removed: opResult.removedItems.length,
				excluded: opResult.excludedInternalCustomerIds.length,
			},
		});
	}

	const writtenIds = new Set([
		...result.changedInternalCustomerIds,
		...result.insertedItems.map(({ internalCustomerId }) => internalCustomerId),
		...result.removedItems.map(({ internalCustomerId }) => internalCustomerId),
	]);
	result.sqlWrittenWorkerCustomerIds = [...writtenIds].filter((id) =>
		workerIds.has(id),
	);
	return result;
};
