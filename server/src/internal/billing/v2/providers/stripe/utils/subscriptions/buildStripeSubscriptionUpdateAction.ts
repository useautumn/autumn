import { msToSeconds } from "@shared/utils/common/unixUtils";
import { notNullish } from "@shared/utils/utils";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type {
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@/internal/billing/v2/types/billingPlan";

export const buildStripeSubscriptionUpdateAction = ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: might be used in the future
	ctx,
	billingContext,
	subItemsUpdate,
	stripeSubscriptionScheduleAction,
	subscriptionCancelAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription, trialContext } = billingContext;

	if (!stripeSubscription) {
		throw new Error(
			"[buildStripeSubscriptionUpdateAction] Cannot update subscription: no existing subscription",
		);
	}

	const trialEndsAt = trialContext?.trialEndsAt;

	// When a schedule manages the subscription, don't set trial_end or cancel_at_period_end
	// The schedule controls these via phase-level settings
	const scheduleManagesSubscription = !!stripeSubscriptionScheduleAction;

	const appliesToBilling = trialContext?.appliesToBilling;
	let shouldSetTrialEnd: boolean | undefined;
	let shouldUnsetTrialEnd: boolean | undefined;
	if (appliesToBilling) {
		shouldSetTrialEnd =
			!scheduleManagesSubscription &&
			notNullish(trialEndsAt) &&
			msToSeconds(trialEndsAt) !== stripeSubscription?.trial_end;

		shouldUnsetTrialEnd = !scheduleManagesSubscription && trialEndsAt === null;
	}

	// Only set cancel_at if it differs from current value
	const currentCancelAt = stripeSubscription.cancel_at;
	const shouldSetCancelAt =
		subscriptionCancelAt !== undefined &&
		subscriptionCancelAt !== currentCancelAt;

	const params: Stripe.SubscriptionUpdateParams = {
		items: subItemsUpdate.length > 0 ? subItemsUpdate : undefined,
		trial_end: shouldSetTrialEnd
			? msToSeconds(trialEndsAt!) // safe to unwrap because we checked notNullish above
			: shouldUnsetTrialEnd
				? "now"
				: undefined,
		cancel_at: shouldSetCancelAt ? subscriptionCancelAt : undefined,
		proration_behavior: "none",
	};

	const hasNoUpdates = [params.items, params.trial_end, params.cancel_at].every(
		(field) => field === undefined,
	);

	if (hasNoUpdates) {
		return undefined;
	}

	return {
		type: "update" as const,
		stripeSubscriptionId: stripeSubscription.id,
		params,
	};
};
