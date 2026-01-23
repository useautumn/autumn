import { type AttachV0Params, notNullish } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import type { AttachBillingContext } from "../types/attachBillingContext";
import { setupAttachCheckoutMode } from "./setupAttachCheckoutMode";
import { setupAttachEndOfCycleMs } from "./setupAttachEndOfCycleMs";
import { setupAttachProductContext } from "./setupAttachProductContext";
import { setupAttachTransitionContext } from "./setupAttachTransitionContext";

/**
 * Assembles the full billing context for attaching a product.
 */
export const setupAttachBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: AttachV0Params;
}): Promise<AttachBillingContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});

	const { attachProduct, customPrices, customEnts } =
		await setupAttachProductContext({
			ctx,
			params,
		});

	const { currentCustomerProduct, scheduledCustomerProduct, planTiming } =
		setupAttachTransitionContext({
			fullCustomer,
			attachProduct,
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
		targetCustomerProduct: currentCustomerProduct,
	});

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct: attachProduct,
		currentCustomerProduct: undefined,
	});

	const invoiceMode = setupInvoiceModeContext({ params });
	const isCustom = notNullish(params.items);

	const endOfCycleMs = setupAttachEndOfCycleMs({
		planTiming,
		currentCustomerProduct,
		stripeSubscription,
		currentEpochMs,
	});

	const checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
	});

	return {
		fullCustomer,
		fullProducts: [attachProduct],
		attachProduct,

		currentCustomerProduct,
		scheduledCustomerProduct,

		planTiming,
		endOfCycleMs,
		checkoutMode,

		stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs: "now",
		resetCycleAnchorMs: "now",

		invoiceMode,
		featureQuantities,

		customPrices,
		customEnts,
		isCustom,
	};
};
