import type { TrialContext } from "@autumn/shared";
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

/**
 * Determine the billing cycle anchor based on product transitions.
 */
export const setupBillingCycleAnchor = ({
	stripeSubscription,
	customerProduct,
	newFullProduct,
	trialContext,
	currentEpochMs,
	requestedBillingCycleAnchor,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	newFullProduct: FullProduct;
	trialContext?: TrialContext;
	currentEpochMs: number;
	requestedBillingCycleAnchor?: number | "now";
}): number | "now" => {
	if (requestedBillingCycleAnchor !== undefined) {
		return requestedBillingCycleAnchor;
	}

	const currentIsFree = isCustomerProductFree(customerProduct);
	const newIsFree = isFreeProduct({ prices: newFullProduct.prices });

	// Free -> Free: keep original anchor
	if (currentIsFree && newIsFree) {
		return customerProduct?.starts_at ?? "now";
	}

	const currentIsOneOff = isCustomerProductOneOff(customerProduct);
	const newIsOneOff = isOneOffProduct({ prices: newFullProduct.prices });

	// One-off -> One-off: keep original anchor
	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.starts_at ?? "now";
	}

	// If trialing:
	const stripeTrialEndsAtMs = isStripeSubscriptionTrialing(stripeSubscription)
		? secondsToMs(stripeSubscription?.trial_end)
		: undefined;

	// Prefer the new product's trial context when it has a future end,
	// otherwise inherit the trialing Stripe subscription's trial_end.
	const trialEndsAtMs =
		trialContext?.trialEndsAt && trialContext.trialEndsAt > currentEpochMs
			? trialContext.trialEndsAt
			: stripeTrialEndsAtMs;

	// Billing cycle anchor = trial ends at if exists
	if (trialEndsAtMs) return trialEndsAtMs;

	return secondsToMs(stripeSubscription?.billing_cycle_anchor) ?? "now";
};
