import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupTrialContext } from "@/internal/billing/v2/setup/setupTrialContext";
import { setupUpdateSubscriptionProductContext } from "@/internal/billing/v2/updateSubscription/setup/setupUpdateSubscriptionProductContext";
import type { UpdateSubscriptionBillingContext } from "../../billingContext";

/**
 * Fetch the context for updating a subscription
 * @param ctx - The context
 * @param body - The body of the request
 * @returns The update subscription context
 */
export const setupUpdateSubscriptionBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV0Params;
}): Promise<UpdateSubscriptionBillingContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});

	const { customerProduct, fullProduct, customPrices, customEnts } =
		await setupUpdateSubscriptionProductContext({
			ctx,
			fullCustomer,
			params,
		});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct,
		currentCustomerProduct: customerProduct,
	});

	const {
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		stripeDiscounts,
		paymentMethod,
		testClockFrozenTime,
	} = await setupStripeBillingContext({
		ctx,
		fullCustomer,
		targetCustomerProduct: customerProduct,
	});

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	// 1. Setup trial context first
	const trialContext = setupTrialContext({
		stripeSubscription,
		customerProduct,
		currentEpochMs,
		params,
		fullProduct,
	});

	// 3. Determine final anchor based on product transitions
	let billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct,
		newFullProduct: fullProduct,
		trialContext,
		currentEpochMs,
	});

	// 4. Trial ends at overrides reset cycle anchor
	if (trialContext?.trialEndsAt) {
		billingCycleAnchorMs = trialContext.trialEndsAt;
	}

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct,
		newFullProduct: fullProduct,
	});

	const invoiceMode = setupInvoiceModeContext({ params });

	return {
		fullCustomer,
		fullProducts: [fullProduct],
		customerProduct,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		stripeCustomer,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,

		invoiceMode,
		featureQuantities,

		customPrices,
		customEnts,
		trialContext,
	};
};
