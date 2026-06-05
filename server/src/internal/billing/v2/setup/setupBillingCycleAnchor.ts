import type { TrialContext } from "@autumn/shared";
import {
	type FullCusProduct,
	type FullProduct,
	isCustomerProductFree,
	isCustomerProductOneOff,
	isFreeProduct,
	isOneOffProduct,
	isPastStartDate,
	isProductPaidAndRecurring,
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
	billingStartsAt,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	newFullProduct: FullProduct;
	trialContext?: TrialContext;
	currentEpochMs: number;
	requestedBillingCycleAnchor?: number | "now";
	billingStartsAt?: number;
}): number | "now" => {
	if (requestedBillingCycleAnchor !== undefined) {
		return requestedBillingCycleAnchor;
	}

	// A new backdated subscription anchors its cycle to the past starts_at
	// (Stripe's backdate_start_date anchors there too). Only for a new paid
	// recurring line — backdating an existing line is rejected upstream, and
	// free/one-off products have no recurring cycle to anchor.
	if (
		billingStartsAt !== undefined &&
		isPastStartDate(billingStartsAt, currentEpochMs) &&
		!customerProduct &&
		isProductPaidAndRecurring(newFullProduct)
	) {
		return billingStartsAt;
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

	const newIsTrialing =
		(trialContext?.trialEndsAt && trialContext.trialEndsAt > currentEpochMs) ??
		stripeTrialEndsAtMs;

	// Billing cycle anchor = trial ends at if exists
	if (newIsTrialing) return trialContext?.trialEndsAt ?? "now";

	return secondsToMs(stripeSubscription?.billing_cycle_anchor) ?? "now";
};
