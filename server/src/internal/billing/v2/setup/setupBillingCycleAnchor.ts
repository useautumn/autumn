import {
	type FullCusProduct,
	type FullProduct,
	isCustomerProductFree,
	isCustomerProductOneOff,
	isFreeProduct,
	isOneOffProduct,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { TrialContext } from "@/internal/billing/v2/billingContext";

/**
 * Determine the billing cycle anchor based on product transitions.
 */
export const setupBillingCycleAnchor = ({
	stripeSubscription,
	customerProduct,
	newFullProduct,
	trialContext,
	currentEpochMs,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	newFullProduct: FullProduct;
	trialContext?: TrialContext;
	currentEpochMs: number;
}): number | "now" => {
	const currentIsFree = isCustomerProductFree(customerProduct);
	const newIsFree = isFreeProduct({ prices: newFullProduct.prices });

	// Free -> Free: keep original anchor
	if (currentIsFree && newIsFree) {
		return customerProduct?.created_at ?? "now";
	}

	const currentIsOneOff = isCustomerProductOneOff(customerProduct);
	const newIsOneOff = isOneOffProduct({ prices: newFullProduct.prices });

	// One-off -> One-off: keep original anchor
	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.created_at ?? "now";
	}

	// If trialing:
	const stripeTrialEndsAtMs = isStripeSubscriptionTrialing(stripeSubscription)
		? secondsToMs(stripeSubscription?.trial_end)
		: undefined;

	const newIsTrialing =
		(trialContext?.trialEndsAt && trialContext.trialEndsAt > currentEpochMs) ??
		stripeTrialEndsAtMs;

	// Billing cycle anchor = trial ends at if exists
	if (newIsTrialing) return trialContext?.trialEndsAt ?? "now";

	return secondsToMs(stripeSubscription?.billing_cycle_anchor) ?? "now";
};
