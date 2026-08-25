import type {
	FreeTrialParamsSource,
	FullCusProduct,
	FullProduct,
	TrialContext,
} from "@autumn/shared";
import {
	isProductPaidAndRecurring,
	resolveFreeTrialParam,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import {
	handleFreeTrialParam,
	inheritTrialFromCustomerProduct,
	inheritTrialFromSubscription,
} from "@/internal/billing/v2/setup/trialContext";

/**
 * Sets up trial context for update subscription operations.
 *
 * Logic:
 * 1. If a free_trial param passed (customize.free_trial or the shorthand) → Use it (null removes trial, value sets fresh trial)
 * 2. If paid product with trialing subscription → Inherit from subscription
 * 3. If customer product is trialing (free product case) → Inherit from customer product
 * 4. Otherwise → No trial context
 */
export const setupUpdateSubscriptionTrialContext = ({
	stripeSubscription,
	customerProduct,
	currentEpochMs,
	params,
	fullProduct,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	currentEpochMs: number;
	fullProduct: FullProduct;
	params: FreeTrialParamsSource;
}): TrialContext | undefined => {
	// Handle explicit free_trial param (null or value), in either shape
	const freeTrialParam = resolveFreeTrialParam(params);
	if (freeTrialParam !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: freeTrialParam,
			stripeSubscription,
			customerProduct,
			fullProduct,
			currentEpochMs,
		});
	}

	// Inherit from stripe subscription (paid product case)
	if (isProductPaidAndRecurring(fullProduct)) {
		if (
			stripeSubscription &&
			isStripeSubscriptionTrialing(stripeSubscription)
		) {
			return inheritTrialFromSubscription({ stripeSubscription });
		}
		return undefined;
	}

	// Inherit from customer product (free product case)
	if (customerProduct) {
		return inheritTrialFromCustomerProduct({ customerProduct, currentEpochMs });
	}

	return undefined;
};
