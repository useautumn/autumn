import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingContextOverride,
} from "@autumn/shared";
import { BillingVersion, notNullish } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupTransitionConfigs } from "@/internal/billing/v2/setup/setupTransitionConfigs";
import { setupAttachCheckoutMode } from "./setupAttachCheckoutMode";
import { setupAttachEndOfCycleMs } from "./setupAttachEndOfCycleMs";
import { setupAttachProductContext } from "./setupAttachProductContext";
import { setupAttachTransitionContext } from "./setupAttachTransitionContext";
import { setupAttachTrialContext } from "./setupAttachTrialContext";

/**
 * Assembles the full billing context for attaching a product.
 */
export const setupAttachBillingContext = async ({
	ctx,
	params,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	contextOverride?: BillingContextOverride;
}): Promise<AttachBillingContext> => {
	const { fullCustomer: fullCustomerOverride } = contextOverride;

	const fullCustomer =
		fullCustomerOverride ??
		(await setupFullCustomerContext({
			ctx,
			params,
		}));

	const {
		fullProduct: attachProduct,
		customPrices,
		customEnts,
	} = await setupAttachProductContext({
		ctx,
		params,
		contextOverride,
	});

	const { currentCustomerProduct, scheduledCustomerProduct, planTiming } =
		setupAttachTransitionContext({
			fullCustomer,
			attachProduct,
			planScheduleOverride: params.plan_schedule,
		});

	// Only respect new_billing_subscription for non-transition scenarios
	// (add-ons, entity products). Upgrades/downgrades ignore the flag.
	const shouldForceNewSubscription =
		!currentCustomerProduct && params.new_billing_subscription;

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
		contextOverride,
		paramDiscounts: params.discounts,
		newBillingSubscription: shouldForceNewSubscription || undefined,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct: attachProduct,
		currentCustomerProduct: currentCustomerProduct,
		initializeUndefinedQuantities: true,
		contextOverride,
	});

	const invoiceMode = setupInvoiceModeContext({ params });
	const isCustom = notNullish(params.customize);

	// Timestamp context
	const currentEpochMs = testClockFrozenTime ?? Date.now();

	// Setup trial context
	const trialContext = await setupAttachTrialContext({
		ctx,
		params,
		currentContext: {
			fullCustomer,
			attachProduct,
			stripeSubscription,
			currentEpochMs,
			currentCustomerProduct,
		},
	});

	let billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: currentCustomerProduct,
		newFullProduct: attachProduct,
		trialContext,
		currentEpochMs,
	});

	// Trial ends at overrides billing cycle anchor
	if (trialContext?.trialEndsAt) {
		billingCycleAnchorMs = trialContext.trialEndsAt;
	}

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct: undefined, // don't pass in current customer product here (paid products should have the reset cycle anchor correctly...)
		newFullProduct: attachProduct,
	});

	const endOfCycleMs = setupAttachEndOfCycleMs({
		planTiming,
		currentCustomerProduct,
		stripeSubscription,
		billingCycleAnchorMs,
		currentEpochMs,
	});

	const checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
		attachProduct,
		stripeSubscription,
		trialContext,
	});

	const transitionConfigs = setupTransitionConfigs({
		params,
		contextOverride,
	});

	return {
		fullCustomer,
		fullProducts: [attachProduct],
		attachProduct,
		featureQuantities,
		transitionConfigs,

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

		customPrices,
		customEnts,
		isCustom,
		trialContext,

		checkoutQuantityAdjustable: params.adjustable_quantity,

		billingVersion: contextOverride.billingVersion ?? BillingVersion.V2,
	};
};
