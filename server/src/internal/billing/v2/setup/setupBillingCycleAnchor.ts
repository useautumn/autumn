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

export const setupBillingCycleAnchor = ({
	stripeSubscription,
	customerProduct,
	newFullProduct,
	trialContext,
	currentEpochMs,
	requestedBillingCycleAnchor,
	billingStartsAt,
	billingStartsAtToleranceMs,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	newFullProduct: FullProduct;
	trialContext?: TrialContext;
	currentEpochMs: number;
	requestedBillingCycleAnchor?: number | "now";
	billingStartsAt?: number;
	billingStartsAtToleranceMs?: number;
}): number | "now" => {
	if (requestedBillingCycleAnchor === "now") return "now";

	if (typeof requestedBillingCycleAnchor === "number" && !stripeSubscription) {
		return requestedBillingCycleAnchor;
	}

	if (
		billingStartsAt !== undefined &&
		!stripeSubscription &&
		isPastStartDate(
			billingStartsAt,
			currentEpochMs,
			billingStartsAtToleranceMs,
		) &&
		!customerProduct &&
		isProductPaidAndRecurring(newFullProduct)
	) {
		return billingStartsAt;
	}

	const currentIsFree = isCustomerProductFree(customerProduct);
	const newIsFree = isFreeProduct({ product: newFullProduct });

	if (currentIsFree && newIsFree) {
		return customerProduct?.starts_at ?? "now";
	}

	const currentIsOneOff = isCustomerProductOneOff(customerProduct);
	const newIsOneOff = isOneOffProduct({ product: newFullProduct });

	if (currentIsOneOff && newIsOneOff) {
		return customerProduct?.starts_at ?? "now";
	}

	const stripeTrialEndsAtMs = isStripeSubscriptionTrialing(stripeSubscription)
		? secondsToMs(stripeSubscription?.trial_end)
		: undefined;

	const newIsTrialing: boolean =
		trialContext?.trialEndsAt != null
			? trialContext.trialEndsAt > currentEpochMs
			: stripeTrialEndsAtMs != null;

	if (newIsTrialing) {
		if (trialContext?.trialEndsAt) return trialContext.trialEndsAt;
		if (newIsFree && stripeTrialEndsAtMs != null) return stripeTrialEndsAtMs;
		return "now";
	}

	const stripeAnchorMs = secondsToMs(stripeSubscription?.billing_cycle_anchor);

	// Stripe stores the anchor in SECONDS (rounded either way from the ms
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
