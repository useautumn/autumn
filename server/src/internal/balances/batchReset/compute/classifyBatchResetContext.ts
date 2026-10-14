import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type {
	BatchResetContext,
	BatchResetGroup,
	ResetVerdict,
} from "../types.js";
import { classifyResetCandidate } from "./classifyResetCandidate.js";

export type ClassifiedBatchResetContext = {
	resetGroups: BatchResetGroup[];
	verdicts: ResetVerdict[];
};

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
