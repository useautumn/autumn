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

/**
 * Sets up trial context for update subscription operations.
 *
 * Logic:
 * 1. If a free_trial param passed (customize.free_trial or the shorthand) → Use it (null removes trial, value sets fresh trial)
 * 2. If revert trial → Inherit from customer product (its subscription belongs to the paused plan)
 * 3. If Autumn-managed no-card trial (on_trial_end "bill", no Stripe sub) → keep it Autumn-managed
 * 4. If paid product with trialing subscription → Inherit from subscription
 * 5. If customer product is trialing (free product case) → Inherit from customer product
 * 6. Otherwise → No trial context
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
	const isRevertTrial = isCustomerProductRevertingTrial(customerProduct);
	const isAutumnManagedTrial =
		isCustomerProductAutumnManagedTrial(customerProduct);

	// Handle explicit free_trial param (null or value), in either shape
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

		// A changed no-card trial stays Autumn's; removing it or requiring a card moves it to Stripe.
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
