import type {
	AutumnBillingPlan,
	BillingContext,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import { msToSeconds } from "@shared/utils/common/unixUtils";
import { notNullish } from "@shared/utils/utils";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeDiscountsToSubscriptionUpdateParam } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";
import { buildStripeSubscriptionUpdateParams } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionParams";
import { shouldEnableStripeAutomaticTax } from "@/internal/billing/v2/providers/stripe/utils/tax/shouldEnableStripeAutomaticTax";

export const buildStripeSubscriptionUpdateAction = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	subItemsUpdate,
	stripeSubscriptionScheduleAction,
	subscriptionCancelAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number | null;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription, trialContext, stripeDiscounts } = billingContext;

	if (!stripeSubscription) {
		throw new Error(
			"[buildStripeSubscriptionUpdateAction] Cannot update subscription: no existing subscription",
		);
	}

	const trialEndsAt = trialContext?.trialEndsAt;
	const discounts = stripeDiscountsToSubscriptionUpdateParam({
		stripeSubscription,
		stripeDiscounts,
	});

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

	const currentCancelAt = stripeSubscription.cancel_at;
	const shouldClearCancelAt =
		subscriptionCancelAt === null && currentCancelAt !== null;

	const shouldSetCancelAt =
		!shouldClearCancelAt &&
		typeof subscriptionCancelAt === "number" &&
		subscriptionCancelAt !== currentCancelAt;

	const shouldUpdateEndBehavior =
		shouldUnsetTrialEnd &&
		stripeSubscription.trial_settings?.end_behavior.missing_payment_method !==
			"create_invoice";

	const params: Stripe.SubscriptionUpdateParams = {
		items: subItemsUpdate.length > 0 ? subItemsUpdate : undefined,
		trial_end: shouldSetTrialEnd
			? msToSeconds(trialEndsAt!)
			: shouldUnsetTrialEnd
				? "now"
				: undefined,
		cancel_at: shouldClearCancelAt
			? null
			: shouldSetCancelAt
				? subscriptionCancelAt
				: undefined,
		proration_behavior: "none",
		payment_behavior: "error_if_incomplete",

		...(discounts !== undefined && { discounts }),

		...(shouldUpdateEndBehavior && {
			trial_settings: {
				end_behavior: {
					missing_payment_method: "create_invoice",
				},
			},
		}),

		...(shouldEnableStripeAutomaticTax({ ctx, billingContext })
			? { automatic_tax: { enabled: true } }
			: {}),
	};

	const hasNoUpdates = [
		params.items,
		params.trial_end,
		params.cancel_at,
		params.discounts,
	].every((field) => field === undefined);

	if (
		hasNoUpdates &&
		billingContext.requestedBillingCycleAnchor !== "now" &&
		!autumnBillingPlan.customLineItems?.length
	) {
		return undefined;
	}

	return {
		type: "update" as const,
		stripeSubscriptionId: stripeSubscription.id,
		params: buildStripeSubscriptionUpdateParams({
			params,
			subscriptionParams: billingContext.subscriptionParams,
		}),
	};
};
