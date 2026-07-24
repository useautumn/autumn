import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type {
	BatchResetContext,
	BatchResetGroup,
	ResetVerdict,
} from "../types.js";
import { classifyResetCandidate } from "./classifyResetCandidate.js";

export type ClassifiedBatchResetContext = {
	/** Groups containing only customer entitlements that should be reset. */
	resetGroups: BatchResetGroup[];
	/** All non-reset outcomes, flattened for one later bulk write. */
	verdicts: ResetVerdict[];
};

/**
 * Pure classification stage for one hydrated SQS batch.
 *
 * Org contexts stay attached to resettable entitlements because reset
 * computation depends on org configuration. Verdicts are tenant-independent
 * row updates, so they are flattened for the later persistence stage.
 */
export const classifyBatchResetContext = ({
	batchResetContext,
}: {
	batchResetContext: BatchResetContext;
}): ClassifiedBatchResetContext => {
	const resetGroups: BatchResetGroup[] = [];
	const verdicts: ResetVerdict[] = [];

	for (const group of batchResetContext.groups) {
		const resettable: ResetContextCustomerEntitlement[] = [];

		for (const customerEntitlement of group.customerEntitlements) {
			const verdict = classifyResetCandidate({ customerEntitlement });
			if (verdict) {
				verdicts.push(verdict);
			} else {
				resettable.push(customerEntitlement);
			}
		}

		if (resettable.length > 0) {
			resetGroups.push({
				ctx: group.ctx,
				customerEntitlements: resettable,
			});
		}
	}

	return { resetGroups, verdicts };
};
