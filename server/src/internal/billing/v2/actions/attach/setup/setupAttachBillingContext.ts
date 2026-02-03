import type { AttachBillingContext } from "@autumn/shared";
import {
	type AttachParamsV0,
	BillingVersion,
	notNullish,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
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
	params: AttachParamsV0;
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
		product: attachProduct,
		targetCustomerProduct: currentCustomerProduct,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct: attachProduct,
		currentCustomerProduct: currentCustomerProduct,
		initializeUndefinedQuantities: true,
	});

	const invoiceMode = setupInvoiceModeContext({ params });
	const isCustom = notNullish(params.items);

	// Timestamp context
	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: currentCustomerProduct,
		newFullProduct: attachProduct,
		trialContext: undefined,
		currentEpochMs,
	});

	// if (trialContext?.trialEndsAt) {
	// 	// 4. Trial ends at overrides reset cycle anchor
	// 	billingCycleAnchorMs = trialContext.trialEndsAt;
	// }

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct: currentCustomerProduct,
		newFullProduct: attachProduct,
	});

	const endOfCycleMs = setupAttachEndOfCycleMs({
		planTiming,
		currentCustomerProduct,
		billingCycleAnchorMs,
		currentEpochMs,
	});

	const checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
		attachProduct,
		stripeSubscription,
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
		billingCycleAnchorMs,
		resetCycleAnchorMs,

		invoiceMode,
		featureQuantities,

		customPrices,
		customEnts,
		isCustom,

		billingVersion: BillingVersion.V2,
	};
};
