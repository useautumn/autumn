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
import { stripeDiscountsToParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

export const buildStripeSubscriptionUpdateAction = ({
	ctx,
	billingContext,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: might be used in the future
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

	// Determine cancel_at: null = clear, number = set, undefined = don't touch
	const currentCancelAt = stripeSubscription.cancel_at;
	const shouldClearCancelAt =
		subscriptionCancelAt === null && currentCancelAt !== null;

	const shouldSetCancelAt =
		!shouldClearCancelAt &&
		typeof subscriptionCancelAt === "number" &&
		subscriptionCancelAt !== currentCancelAt;

	// Configure trial settings off
	const shouldUpdateEndBehavior =
		shouldUnsetTrialEnd &&
		stripeSubscription.trial_settings?.end_behavior.missing_payment_method !==
			"create_invoice";

	const params: Stripe.SubscriptionUpdateParams = {
		items: subItemsUpdate.length > 0 ? subItemsUpdate : undefined,
		trial_end: shouldSetTrialEnd
			? msToSeconds(trialEndsAt!) // safe to unwrap because we checked notNullish above
			: shouldUnsetTrialEnd
				? "now"
				: undefined,
		cancel_at: shouldClearCancelAt
			? null
			: shouldSetCancelAt
				? subscriptionCancelAt
				: undefined,
		proration_behavior: "none",

		...(stripeDiscounts?.length && {
			discounts: stripeDiscountsToParams({ stripeDiscounts }),
		}),

		...(shouldUpdateEndBehavior && {
			trial_settings: {
				end_behavior: {
					missing_payment_method: "create_invoice",
				},
			},
		}),

		// Tax policy lives in the org config — when on, every sub.update we
		// dispatch propagates `automatic_tax: { enabled: true }` so existing
		// subs catch up to the org's tax setting on their next mutation.
		// Owning this here (not at execute time) keeps the action object
		// self-describing in logs / EXTRA LOGS / debug snapshots.
		//
		// Skip when invoice mode — Stripe rejects auto_tax on invoices that
		// can't collect customer address. If the resulting sub.update emits
		// an invoice with `collection_method: send_invoice`, the hosted
		// invoice page has no address form and Stripe Tax errors out.
		...(ctx.org.config.automatic_tax && !billingContext.invoiceMode
			? { automatic_tax: { enabled: true } }
			: {}),
	};

	// Note: `automatic_tax` is intentionally excluded from this check.
	// It's only attached to update params that ALREADY have a real reason
	// to fire (items/trial/cancel/discounts changed). We don't fire a
	// sub.update purely to propagate the auto_tax flag — that would create
	// noise on every flag flip.
	const hasNoUpdates = [
		params.items,
		params.trial_end,
		params.cancel_at,
		params.discounts,
	].every((field) => field === undefined);

	if (hasNoUpdates) {
		return undefined;
	}

	return {
		type: "update" as const,
		stripeSubscriptionId: stripeSubscription.id,
		params,
	};
};
