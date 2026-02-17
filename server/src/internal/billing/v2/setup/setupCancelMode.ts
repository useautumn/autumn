import type { CancelAction, UpdateSubscriptionV1Params } from "@autumn/shared";

/**
 * Setup cancel action from params
 * @param params - The params
 * cancel_action param maps directly to internal cancel action
 * - cancel_action: "cancel_immediately" means cancel immediately
 * - cancel_action: "cancel_end_of_cycle" means cancel at end of cycle
 * - cancel_action: "uncancel" means remove scheduled cancellation
 * - cancel_action: undefined means no cancel operation
 * @returns The cancel action
 */
export const setupCancelAction = ({
	params,
}: {
	params: UpdateSubscriptionV1Params;
}): CancelAction | undefined => {
	return params.cancel_action;
};
