import { msToSeconds } from "@shared/utils/common/unixUtils";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { FreeTrialPlan } from "@/internal/billing/v2/billingPlan";

export const buildStripeSubscriptionUpdateAction = ({
	ctx,
	billingContext,
	subItemsUpdate,
	freeTrialPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	freeTrialPlan?: FreeTrialPlan;
}) => {
	const { stripeSubscription } = billingContext;

	if (!stripeSubscription) {
		throw new Error(
			"[buildStripeSubscriptionUpdateAction] Cannot update subscription: no existing subscription",
		);
	}

	const trialEndsAt = freeTrialPlan?.trialEndsAt;
	const cancelAtPeriodEnd = isStripeSubscriptionCanceling(stripeSubscription)
		? false
		: undefined;

	const params: Stripe.SubscriptionUpdateParams = {
		items: subItemsUpdate.length > 0 ? subItemsUpdate : undefined,
		trial_end: trialEndsAt ? msToSeconds(trialEndsAt) : undefined,
		proration_behavior: "none",
		cancel_at_period_end: cancelAtPeriodEnd,
	};

	if (
		params.items === undefined &&
		params.trial_end === undefined &&
		params.cancel_at_period_end === undefined
	) {
		return undefined;
	}

	return {
		type: "update" as const,
		stripeSubscriptionId: stripeSubscription.id,
		params,
	};
};
