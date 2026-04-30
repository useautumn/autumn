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

	// When a schedule manages the sub, leave trial_end/cancel alone — the
	// schedule sets those via phase-level settings.
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

	// cancel_at: null = clear, number = set, undefined = unchanged.
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

		// Propagate auto_tax onto every sub.update so existing subs catch up
		// when the org flag flips. Baked in here (not execute) for log
		// self-description. Skipped in invoice mode: send_invoice invoices
		// can't collect address, so Stripe Tax rejects.
		...(ctx.org.config.automatic_tax && !billingContext.invoiceMode
			? { automatic_tax: { enabled: true } }
			: {}),
	};

	// `automatic_tax` is excluded from this check: we only ride along on
	// updates that have a real reason to fire, never trigger one just to
	// propagate the flag.
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
