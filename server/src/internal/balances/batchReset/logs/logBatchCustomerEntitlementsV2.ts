import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { ClassifiedBatchResetContext } from "../compute/classifyBatchResetContext.js";
import type {
	BatchResetContext,
	BatchResetCustomerEntitlementsV2Payload,
	ResetMutation,
	VerdictMutations,
} from "../types.js";

export const logBatchCustomerEntitlementsV2 = ({
	logger,
	payload,
	batchResetContext,
	classifiedBatchResetContext,
	verdictMutations,
	resetMutations,
}: {
	logger: Logger;
	payload: BatchResetCustomerEntitlementsV2Payload;
	batchResetContext: BatchResetContext;
	classifiedBatchResetContext: ClassifiedBatchResetContext;
	verdictMutations: VerdictMutations;
	resetMutations: ResetMutation[];
}) => {
	const resettableCount = classifiedBatchResetContext.resetGroups.reduce(
		(total, group) => total + group.customerEntitlements.length,
		0,
	);

	logger.info("[batchReset] mutations computed", {
		data: {
			requested: payload.customerEntitlementIds.length,
			missing: batchResetContext.missingIds.length,
			invalid: batchResetContext.invalidCount,
			orgs: batchResetContext.groups.length,
			resetOrgs: classifiedBatchResetContext.resetGroups.length,
			resettable: resettableCount,
			customerEntitlementsToExpire:
				verdictMutations.expireCustomerEntitlementIds.length,
			resetMutations: resetMutations.length,
			verdicts: classifiedBatchResetContext.verdicts.length,
		},
	});
};
