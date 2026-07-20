import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { BatchTransitionContext } from "../types/types";

export const logBatchTransitionContext = ({
	ctx,
	batchTransitionContext,
}: {
	ctx: AutumnContext;
	batchTransitionContext: BatchTransitionContext;
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			batchTransitionContext: {
				customerId: batchTransitionContext.fullCustomer.id,
				internalCustomerId: batchTransitionContext.fullCustomer.internal_id,
				parentCustomerProductId:
					batchTransitionContext.parentCustomerProduct.id,
				currentEpochMs: batchTransitionContext.currentEpochMs,
				resetCycleAnchorMs: batchTransitionContext.resetCycleAnchorMs,
			},
		},
	});
};
