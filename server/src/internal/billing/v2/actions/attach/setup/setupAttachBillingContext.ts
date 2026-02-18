import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingContextOverride,
} from "@autumn/shared";
import {
	ACTIVE_STATUSES,
	BillingVersion,
	CusProductStatus,
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	isOneOffProduct,
	notNullish,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupTransitionConfigs } from "@/internal/billing/v2/setup/setupTransitionConfigs";
import { setupAdjustableQuantities } from "../../../setup/setupAdjustableQuantities";
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

	const isAttachPaidRecurring =
		!isOneOffProduct({ prices: attachProduct.prices }) &&
		!isFreeProduct({ prices: attachProduct.prices });

	const hasPaidRecurringSubscription = fullCustomer.customer_products.some(
		(customerProduct) => {
			const hasActiveOrTrialingStatus =
				ACTIVE_STATUSES.includes(customerProduct.status) ||
				customerProduct.status === CusProductStatus.Trialing;

			if (!hasActiveOrTrialingStatus) return false;
			if (!customerProduct.subscription_ids?.length) return false;

			const prices = cusProductToPrices({
				cusProduct: customerProduct,
			});

			return !isOneOffProduct({ prices }) && !isFreeProduct({ prices });
		},
	);

	const isTransitionFromFree =
		notNullish(currentCustomerProduct) &&
		isFreeProduct({
			prices: cusProductToPrices({
				cusProduct: currentCustomerProduct,
			}),
		});

	// Only respect new_billing_subscription for non-transition scenarios
	// (add-ons, entity products). Upgrades/downgrades ignore the flag.
	const shouldForceNewSubscription =
		(!currentCustomerProduct && params.new_billing_subscription) ||
		(Boolean(params.new_billing_subscription) &&
			isAttachPaidRecurring &&
			isTransitionFromFree &&
			hasPaidRecurringSubscription);

	const requirePaidSubscriptionTarget =
		isAttachPaidRecurring && !shouldForceNewSubscription;

	if (
		params.new_billing_subscription === false &&
		requirePaidSubscriptionTarget &&
		!hasPaidRecurringSubscription
	) {
		throw new RecaseError({
			message:
				"Cannot merge with an existing billing cycle because the customer has no active paid recurring subscription. Set new_billing_subscription to true to create a new cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

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
		requirePaidSubscriptionTarget: requirePaidSubscriptionTarget || undefined,
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

	const transitionConfig = setupTransitionConfigs({
		params,
		contextOverride,
	});

	return {
		fullCustomer,
		fullProducts: [attachProduct],
		attachProduct,
		featureQuantities,
		transitionConfig,

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

		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),

		billingVersion: contextOverride.billingVersion ?? BillingVersion.V2,
	};
};
