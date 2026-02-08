import type { FullCusProduct, TrialContext } from "@autumn/shared";
import { isCustomerProductTrialing } from "@autumn/shared";

/**
 * Inherits trial state from an existing customer product.
 * Used by update subscription for free products (no Stripe subscription).
 *
 * Returns undefined if customer product is not trialing.
 */
export const inheritTrialFromCustomerProduct = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}): TrialContext | undefined => {
	if (!isCustomerProductTrialing(customerProduct, { nowMs: currentEpochMs })) {
		return undefined;
	}

	return {
		freeTrial: customerProduct.free_trial,
		trialEndsAt: customerProduct.trial_ends_at ?? null,
		appliesToBilling: false,
		cardRequired: true,
	};
};
