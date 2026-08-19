import type {
	BalanceTransitionPlan,
	BalanceTransitionUnsupportedReason,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type PublishBillingTransitionDecision =
	| { shouldPublish: true; balanceTransitionPlan: BalanceTransitionPlan }
	| {
			shouldPublish: false;
			unsupportedReason?: BalanceTransitionUnsupportedReason;
	  };

export const shouldPublishBillingTransition = ({
	ctx,
	billingPlan,
	executionDeferred = false,
}: {
	ctx: AutumnContext;
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
	if (executionDeferred || ctx.skipCache) {
		return { shouldPublish: false };
	}

	return { shouldPublish: true, balanceTransitionPlan };
};
