import type {
	FreeTrial,
	FullProduct,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import {
	addDuration,
	initFreeTrial,
	isProductPaidAndRecurring,
	secondsToMs,
} from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";

interface ComputeSubscriptionUpdateTrialDetailsResult {
	freeTrialPlan: {
		freeTrial?: FreeTrial | null;
		trialEndsAt?: number;
	};
	customFreeTrial?: FreeTrial;
}

export const computeCustomPlanFreeTrial = ({
	updateSubscriptionContext,
	params,
	fullProduct,
}: {
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
	fullProduct: FullProduct;
}): ComputeSubscriptionUpdateTrialDetailsResult => {
	const { stripeSubscription, customerProduct, currentEpochMs } =
		updateSubscriptionContext;

	const freeTrialParams = params.free_trial;

	// Case 1: If free trial is null (removing free trial)
	if (freeTrialParams === null) {
		return { freeTrialPlan: { freeTrial: null } };
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
			freeTrialPlan: { freeTrial: dbFreeTrial, trialEndsAt },
			customFreeTrial: dbFreeTrial,
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
				freeTrialPlan: { freeTrial: null, trialEndsAt },
			};
		} else {
			return {
				freeTrialPlan: { freeTrial: null },
			};
		}
	}

	// Case 4: Return free trial / trial ends at from current customer product
	return {
		freeTrialPlan: {
			freeTrial: customerProduct.free_trial,
			trialEndsAt: customerProduct.trial_ends_at ?? undefined,
		},
	};
};
