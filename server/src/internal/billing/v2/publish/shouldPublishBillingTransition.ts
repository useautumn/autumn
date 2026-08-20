import type {
	BalanceTransitionPlan,
	BalanceTransitionUnsupportedReason,
	BillingPlan,
} from "@autumn/shared";

export type PublishBillingTransitionDecision =
	| { shouldPublish: true; balanceTransitionPlan: BalanceTransitionPlan }
	| {
			shouldPublish: false;
			unsupportedReason?: BalanceTransitionUnsupportedReason;
	  };

export const shouldPublishBillingTransition = ({
	billingPlan,
	executionDeferred = false,
}: {
	billingPlan: BillingPlan;
	executionDeferred?: boolean;
}): PublishBillingTransitionDecision => {
	const balanceTransitionPlan = billingPlan.autumn.balanceTransitionPlan;
	if (!balanceTransitionPlan) return { shouldPublish: false };
	if (balanceTransitionPlan.unsupportedReason) {
		return {
			shouldPublish: false,
			unsupportedReason: balanceTransitionPlan.unsupportedReason,
		};
	}
	if (executionDeferred) {
		return { shouldPublish: false };
	}

	return { shouldPublish: true, balanceTransitionPlan };
};
