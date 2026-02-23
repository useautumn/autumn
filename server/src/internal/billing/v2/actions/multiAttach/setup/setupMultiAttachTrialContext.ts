import type { FullProduct, TrialContext } from "@autumn/shared";
import { isOneOffProduct, isProductPaidAndRecurring } from "@autumn/shared";
import type { FreeTrialParamsV1 } from "@shared/api/common/freeTrial/freeTrialParamsV1";
import type Stripe from "stripe";
import { handleFreeTrialParam } from "@/internal/billing/v2/setup/trialContext";

/**
 * Sets up trial context for multi-attach operations.
 * Only uses the top-level free_trial param — does not inherit from plans.
 *
 * Prioritizes paid recurring products for trial context, falls back to any recurring product.
 */
export const setupMultiAttachTrialContext = ({
	freeTrialParam,
	stripeSubscription,
	fullProducts,
	currentEpochMs,
}: {
	freeTrialParam?: FreeTrialParamsV1 | null;
	stripeSubscription?: Stripe.Subscription;
	fullProducts: FullProduct[];
	currentEpochMs: number;
}): TrialContext | undefined => {
	if (freeTrialParam === undefined) {
		return undefined;
	}

	// Prioritize paid recurring, fall back to any recurring product
	const paidRecurring = fullProducts.find((p) => isProductPaidAndRecurring(p));
	const anyRecurring = fullProducts.find(
		(p) => !isOneOffProduct({ prices: p.prices }),
	);
	const targetProduct = paidRecurring ?? anyRecurring ?? fullProducts[0];

	if (!targetProduct) {
		return undefined;
	}

	return handleFreeTrialParam({
		freeTrialParams: freeTrialParam,
		stripeSubscription,
		fullProduct: targetProduct,
		currentEpochMs,
	});
};
