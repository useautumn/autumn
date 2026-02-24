import type { FullCustomer, FullProduct, TrialContext } from "@autumn/shared";
import { isOneOffProduct, isProductPaidAndRecurring } from "@autumn/shared";
import type { FreeTrialParamsV1 } from "@shared/api/common/freeTrial/freeTrialParamsV1";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyProductTrialConfig,
	handleFreeTrialParam,
} from "@/internal/billing/v2/setup/trialContext";

/**
 * Sets up trial context for multi-attach operations.
 *
 * Logic:
 * 1. If free_trial param is explicitly passed → use it (null removes trial, value sets trial)
 * 2. If free_trial param is undefined → look for the first product with a free_trial and inherit it
 */
export const setupMultiAttachTrialContext = async ({
	ctx,
	freeTrialParam,
	fullCustomer,
	stripeSubscription,
	fullProducts,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	freeTrialParam?: FreeTrialParamsV1 | null;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	fullProducts: FullProduct[];
	currentEpochMs: number;
}): Promise<TrialContext | undefined> => {
	// Prioritize paid recurring, fall back to any recurring product
	const paidRecurring = fullProducts.find((p) => isProductPaidAndRecurring(p));
	const anyRecurring = fullProducts.find(
		(p) => !isOneOffProduct({ prices: p.prices }),
	);
	const targetProduct = paidRecurring ?? anyRecurring ?? fullProducts[0];

	if (!targetProduct) {
		return undefined;
	}

	// 1. Explicit free_trial param → use it
	if (freeTrialParam !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: freeTrialParam,
			stripeSubscription,
			fullProduct: targetProduct,
			currentEpochMs,
		});
	}

	// 2. No explicit param → inherit from first product with a free_trial
	const productWithTrial = fullProducts.find((p) => p.free_trial);

	if (!productWithTrial) {
		return undefined;
	}

	return applyProductTrialConfig({
		ctx,
		fullProduct: productWithTrial,
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
	});
};
