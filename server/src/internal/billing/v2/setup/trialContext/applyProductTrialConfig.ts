import type { FullCustomer, FullProduct, TrialContext } from "@autumn/shared";
import { addDuration, isProductPaidAndRecurring } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getFreeTrialAfterFingerprint } from "@/internal/products/free-trials/freeTrialUtils";

export const applyProductTrialConfig = async ({
	ctx,
	fullProduct,
	fullCustomer,
	stripeSubscription,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	fullProduct: FullProduct;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	currentEpochMs: number;
}): Promise<TrialContext | undefined> => {
	const newProductIsPaidRecurring = isProductPaidAndRecurring(fullProduct);

	if (!fullProduct.free_trial) {
		const isCurrentlyTrialing =
			isStripeSubscriptionTrialing(stripeSubscription);

		if (isCurrentlyTrialing) {
			return {
				freeTrial: null,
				trialEndsAt: null,
				appliesToBilling: newProductIsPaidRecurring,
				cardRequired: false,
			};
		}
		return undefined;
	}

	const multipleTrialsAllowed = ctx.org.config?.multiple_trials ?? false;

	const freeTrial = await getFreeTrialAfterFingerprint({
		db: ctx.db,
		freeTrial: fullProduct.free_trial,
		productId: fullProduct.id,
		fingerprint: fullCustomer.fingerprint,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: fullCustomer.entity?.internal_id,
		multipleAllowed: multipleTrialsAllowed,
	});

	if (!freeTrial) {
		return undefined;
	}

	const trialEndsAt = addDuration({
		now: currentEpochMs,
		durationType: freeTrial.duration,
		durationLength: freeTrial.length,
	});

	return {
		freeTrial,
		trialEndsAt,
		appliesToBilling: newProductIsPaidRecurring,
		cardRequired: freeTrial.card_required,
		onEnd: freeTrial.on_end ?? undefined,
	};
};
