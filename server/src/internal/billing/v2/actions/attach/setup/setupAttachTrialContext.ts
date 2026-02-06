import type {
	AttachParamsV0,
	FullCusProduct,
	FullCustomer,
	FullProduct,
	TrialContext,
} from "@autumn/shared";
import { isProductPaidAndRecurring } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyProductTrialConfig,
	handleFreeTrialParam,
	inheritTrialFromSubscription,
} from "@/internal/billing/v2/setup/trialContext";
import { isAttachUpgrade } from "../utils/isAttachUpgrade";

/**
 * Sets up trial context for attach operations.
 *
 * Logic:
 * 1. If free_trial param passed → Use it (null removes trial, value sets fresh trial)
 * 2. If NOT upgrade AND stripeSubscription exists → Inherit from subscription
 * 3. Otherwise (upgrade OR fresh attach) → Apply product's trial config with dedup
 */
export const setupAttachTrialContext = async ({
	ctx,
	params,
	currentContext,
}: {
	ctx: AutumnContext;
	params: AttachParamsV0;
	currentContext: {
		fullCustomer: FullCustomer;
		attachProduct: FullProduct;
		stripeSubscription?: Stripe.Subscription;
		currentEpochMs: number;
		currentCustomerProduct?: FullCusProduct;
	};
}): Promise<TrialContext | undefined> => {
	const {
		fullCustomer,
		attachProduct,
		stripeSubscription,
		currentEpochMs,
		currentCustomerProduct,
	} = currentContext;

	// Handle explicit free_trial param (null or value)
	if (params.free_trial !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: params.free_trial,
			stripeSubscription,
			fullProduct: attachProduct,
			currentEpochMs,
		});
	}

	const newProductIsPaidRecurring = isProductPaidAndRecurring(attachProduct);

	// Determine if this is an upgrade
	const isUpgrade = isAttachUpgrade({
		currentCustomerProduct,
		attachProduct,
	});

	// Inherit from subscription (merge/downgrade - NOT upgrade)
	if (newProductIsPaidRecurring && stripeSubscription && !isUpgrade) {
		return inheritTrialFromSubscription({ stripeSubscription });
	}

	// Apply product's trial config (upgrade or fresh attach) with dedup check
	return applyProductTrialConfig({
		ctx,
		fullProduct: attachProduct,
		fullCustomer,
		currentEpochMs,
	});
};
