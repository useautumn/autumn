import type { UpdateSubscriptionV0Params } from "@shared/api/billing/updateSubscription/updateSubscriptionV0Params";
import type { CancelMode } from "@shared/api/common/cancelMode";

/**
 * Setup cancel mode from params
 * @param params - The params
 * Converts cancel param to internal cancel mode
 * - cancel: null means "uncancel" (remove scheduled cancellation)
 * - cancel: "immediately" or "end_of_cycle" means cancel
 * - cancel: undefined means no cancel operation
 * @returns The cancel mode
 */
export const setupCancelMode = ({
	params,
}: {
	params: UpdateSubscriptionV0Params;
}): CancelMode | undefined => {
	if (params.cancel === null) {
		return "uncancel";
	}

	return params.cancel;
};
