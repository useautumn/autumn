import type {
	CustomizePlanV1,
	FullCusProduct,
	FullProduct,
	TrialContext,
} from "@autumn/shared";
import { isProductPaidAndRecurring } from "@autumn/shared";
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
 * 1. If customize.free_trial param passed → Use it (null removes trial, value sets fresh trial)
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
	params: { customize?: CustomizePlanV1 };
}): TrialContext | undefined => {
	// Handle explicit free_trial param (null or value)
	if (params.customize?.free_trial !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: params.customize.free_trial,
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
