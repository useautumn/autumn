import { secondsToMs, type UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
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
		paymentMethod,
		testClockFrozenTime,
	} = await setupStripeBillingContext({
		ctx,
		fullCustomer,
		targetCustomerProduct: customerProduct,
	});

	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription?.billing_cycle_anchor,
	);

	// Invoice mode
	const invoiceMode =
		params?.invoice === true
			? {
					finalizeInvoice: params.finalize_invoice === true,
					enableProductImmediately: params.enable_product_immediately !== false,
				}
			: undefined;

	return {
		fullCustomer,
		fullProducts: [fullProduct],
		customerProduct,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs: billingCycleAnchorMs ?? "now",
		invoiceMode,
		featureQuantities,

		customPrices,
		customEnts,
	};
};
