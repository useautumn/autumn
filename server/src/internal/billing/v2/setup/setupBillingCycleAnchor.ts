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

	// When trialContext carries a trial end, it wins (future = trialing, past =
	// not). Only when it's absent do we defer to the existing Stripe trial.
	const newIsTrialing: boolean =
		trialContext?.trialEndsAt != null
			? trialContext.trialEndsAt > currentEpochMs
			: stripeTrialEndsAtMs != null;

	// Billing cycle anchor = trial ends at if exists.
	if (newIsTrialing) {
		if (trialContext?.trialEndsAt) return trialContext.trialEndsAt;
		// Downgrading to Free while the current product is still trialing: let the
		// trial run out and have Free take over at trial end, not now + 1 cycle.
		// (Upgrades to a paid no-trial product instead end the trial now.)
		if (newIsFree && stripeTrialEndsAtMs != null) return stripeTrialEndsAtMs;
		return "now";
	}

	const stripeAnchorMs = secondsToMs(stripeSubscription?.billing_cycle_anchor);

	// Stripe stores the anchor in SECONDS (rounded either way from the ms
	// instant it was created). When it's the same instant the current product
	// started, prefer the ms-precision starts_at so cycles recomputed across
	// updates/upgrades don't drift sub-second (which would churn
	// next_reset_at and spuriously move cycle-keyed state like usage windows).
	const startsAtMs = customerProduct?.starts_at;
	if (
		stripeAnchorMs != null &&
		startsAtMs != null &&
		Math.abs(startsAtMs - stripeAnchorMs) < 1000
	) {
		return startsAtMs;
	}

	return stripeAnchorMs ?? "now";
};
