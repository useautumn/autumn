import type {
	FullCusProduct,
	FullProduct,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import {
	addDuration,
	isCustomerProductTrialing,
	isProductPaidAndRecurring,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { TrialContext } from "@/internal/billing/v2/billingContext";
import { initFreeTrial } from "@/internal/products/free-trials/initFreeTrial";

export const setupTrialContext = ({
	stripeSubscription,
	customerProduct,
	currentEpochMs,
	params,
	fullProduct,
}: {
	stripeSubscription?: Stripe.Subscription;
	customerProduct: FullCusProduct;
	currentEpochMs: number;
	params: UpdateSubscriptionV0Params;
	fullProduct: FullProduct;
}): TrialContext | undefined => {
	const freeTrialParams = params.free_trial;
	const newProductIsPaidRecurring = isProductPaidAndRecurring(fullProduct);

	// Case 1: If free trial is null (removing free trial)
	if (freeTrialParams === null) {
		// If currently trialing, then return this object, if not don't return anything

		if (
			isStripeSubscriptionTrialing(stripeSubscription) ||
			isCustomerProductTrialing(customerProduct, { nowMs: currentEpochMs })
		) {
			return {
				freeTrial: null,
				trialEndsAt: null,
				appliesToBilling: newProductIsPaidRecurring,
				cardRequired: true,
			};
		} else {
			return undefined;
		}
		// return { freeTrial: null, trialEndsAt: null };
	}

	// Case 2: If free trial params are passed in
	if (freeTrialParams) {
		const dbFreeTrial = initFreeTrial({
			freeTrialParams,
			internalProductId: fullProduct.internal_id,
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
	}

	// Case 3: If new product is paid and recurring
	if (isProductPaidAndRecurring(fullProduct)) {
		if (
			stripeSubscription &&
			isStripeSubscriptionTrialing(stripeSubscription)
		) {
			const trialEndsAt = secondsToMs(
				stripeSubscription.trial_end ?? undefined,
			);

			return {
				freeTrial: null,
				trialEndsAt: trialEndsAt,
				appliesToBilling: newProductIsPaidRecurring,
				cardRequired: true,
			};
		} else {
			return undefined;
		}
	}

	// Case 4: Return free trial / trial ends at from current customer product
	if (isCustomerProductTrialing(customerProduct, { nowMs: currentEpochMs })) {
		return {
			freeTrial: customerProduct.free_trial, // can be undefined...
			trialEndsAt: customerProduct.trial_ends_at ?? null,
			appliesToBilling: false,
			cardRequired: true,
		};
	}

	return undefined;
};
