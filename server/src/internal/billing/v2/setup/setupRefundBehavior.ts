import type { RefundBehavior } from "@autumn/shared";
import type { UpdateSubscriptionV0Params } from "@shared/api/billing/updateSubscription/updateSubscriptionV0Params";

export const setupRefundBehavior = ({
	params,
}: {
	params: UpdateSubscriptionV0Params;
}): RefundBehavior | undefined => {
	return params.refund_behavior;
};
