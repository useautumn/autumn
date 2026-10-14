import type {
	FreeTrialParamsSource,
	FullCusProduct,
	FullProduct,
	TrialContext,
} from "@autumn/shared";
import {
	isCustomerProductRevertingTrial,
	isCustomerProductTrialing,
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
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";

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
	const isRevertTrial = isCustomerProductRevertingTrial(customerProduct);
	const isAutumnManagedTrial =
		isCustomerProductAutumnManagedTrial(customerProduct);

	const freeTrialParam = resolveFreeTrialParam(params);
	if (freeTrialParam !== undefined) {
		const trialContext = handleFreeTrialParam({
			freeTrialParams: freeTrialParam,
			stripeSubscription,
			customerProduct,
			fullProduct,
			currentEpochMs,
		});

		if (trialContext && isRevertTrial)
			return { ...trialContext, onEnd: trialContext.onEnd ?? "revert" };

		const staysAutumnManaged =
			isAutumnManagedTrial &&
			trialContext?.cardRequired === false &&
			trialContext.trialEndsAt !== null;
		if (trialContext && staysAutumnManaged)
			return { ...trialContext, autumnManaged: true };

		return trialContext;
	}

	if (customerProduct && isRevertTrial) {
		return inheritTrialFromCustomerProduct({ customerProduct, currentEpochMs });
	}

	if (
		customerProduct &&
		isAutumnManagedTrial &&
		isCustomerProductTrialing(customerProduct, { nowMs: currentEpochMs })
	) {
		return {
			freeTrial: customerProduct.free_trial,
			trialEndsAt: customerProduct.trial_ends_at ?? null,
			appliesToBilling: true,
			cardRequired: false,
			onEnd: customerProduct.on_trial_end ?? undefined,
			autumnManaged: true,
		};
	}

	if (isProductPaidAndRecurring(fullProduct)) {
		if (
			stripeSubscription &&
			isStripeSubscriptionTrialing(stripeSubscription)
		) {
			return inheritTrialFromSubscription({ stripeSubscription });
		}
		return undefined;
	}

	if (customerProduct) {
		return inheritTrialFromCustomerProduct({ customerProduct, currentEpochMs });
	}

	return undefined;
};
