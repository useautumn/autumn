import type { FullCusProduct, FullProduct, TrialContext } from "@autumn/shared";
import {
	addDuration,
	isCustomerProductTrialing,
	isProductPaidAndRecurring,
} from "@autumn/shared";
import type { FreeTrialParamsV0 } from "@shared/api/common/freeTrial/freeTrialParamsV0";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { initFreeTrial } from "@/internal/products/free-trials/initFreeTrial";

/**
 * Handles explicit free_trial parameter passed to attach/update subscription.
 *
 * - `free_trial: null` → Removes trial if currently trialing
 * - `free_trial: { length, duration }` → Starts fresh trial (bypasses dedup)
 */
export const handleFreeTrialParam = ({
	freeTrialParams,
	stripeSubscription,
	customerProduct,
	fullProduct,
	currentEpochMs,
}: {
	freeTrialParams: FreeTrialParamsV0 | null;
	stripeSubscription?: Stripe.Subscription;
	customerProduct?: FullCusProduct;
	fullProduct: FullProduct;
	currentEpochMs: number;
}): TrialContext | undefined => {
	const newProductIsPaidRecurring = isProductPaidAndRecurring(fullProduct);

	// free_trial: null → Remove trial if currently trialing
	if (freeTrialParams === null) {
		const isCurrentlyTrialing =
			isStripeSubscriptionTrialing(stripeSubscription) ||
			isCustomerProductTrialing(customerProduct, { nowMs: currentEpochMs });

		if (isCurrentlyTrialing) {
			return {
				freeTrial: null,
				trialEndsAt: null,
				appliesToBilling: newProductIsPaidRecurring,
				cardRequired: true,
			};
		}
		return undefined;
	}

	// free_trial: { length, duration } → Fresh trial
	const dbFreeTrial = initFreeTrial({
		freeTrialParams,
		internalProductId: fullProduct.internal_id,
		isCustom: true,
	});

	const trialEndsAt = addDuration({
		now: currentEpochMs,
		durationType: dbFreeTrial.duration,
		durationLength: dbFreeTrial.length,
	});

	return {
		freeTrial: dbFreeTrial,
		trialEndsAt,
		customFreeTrial: dbFreeTrial,
		appliesToBilling: newProductIsPaidRecurring,
		cardRequired: dbFreeTrial.card_required,
	};
};
