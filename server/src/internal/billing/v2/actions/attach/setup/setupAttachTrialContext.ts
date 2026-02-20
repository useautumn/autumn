import {
	type AttachParamsV1,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isProductPaidAndRecurring,
	type TrialContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyProductTrialConfig,
	handleFreeTrialParam,
	inheritTrialFromCustomerProduct,
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
	params: AttachParamsV1;
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
	if (params.customize?.free_trial !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: params.customize.free_trial,
			stripeSubscription,
			fullProduct: attachProduct,
			currentEpochMs,
		});
	}

	// Determine if this is an upgrade
	const isUpgrade = isAttachUpgrade({
		currentCustomerProduct,
		attachProduct,
	});

	// If there's current stripe subscription and no upgrade, inherit trial from stripe subscription...
	const newProductIsPaidRecurring = isProductPaidAndRecurring(attachProduct);
	if (newProductIsPaidRecurring && stripeSubscription && !isUpgrade) {
		return inheritTrialFromSubscription({ stripeSubscription });
	}

	// For free products, inherit trial from current customer product
	if (!newProductIsPaidRecurring && currentCustomerProduct) {
		return inheritTrialFromCustomerProduct({
			customerProduct: currentCustomerProduct,
			currentEpochMs,
		});
	}

	// Apply product's trial config (upgrade or fresh attach) with dedup check
	return applyProductTrialConfig({
		ctx,
		fullProduct: attachProduct,
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
	});
};
