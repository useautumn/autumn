import {
	ACTIVE_STATUSES,
	type AttachBillingContext,
	type AttachParamsV1,
	type BillingContextOverride,
	BillingVersion,
	CusProductStatus,
	cusProductToPrices,
	hasCustomItems,
	isFreeProduct,
	isOneOffProduct,
	ms,
	notNullish,
	orgDisableStripeWrites,
	orgToReturnUrl,
} from "@autumn/shared";
import { all } from "better-all";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupTransitionConfigs } from "@/internal/billing/v2/setup/setupTransitionConfigs";
import { setupAdjustableQuantities } from "../../../setup/setupAdjustableQuantities";
import { setupAnchorResetRefund } from "../../../setup/setupAnchorResetRefund";
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

	const {
		fullCustomer,
		attachProductContext: {
			fullProduct: attachProduct,
			customPrices,
			customEnts,
		},
	} = await all({
		async fullCustomer() {
			return (
				fullCustomerOverride ??
				(await setupFullCustomerContext({
					ctx,
					params,
				}))
			);
		},
		async attachProductContext() {
			return setupAttachProductContext({
				ctx,
				params,
				contextOverride,
			});
		},
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

	const skipBillingFetching =
		orgDisableStripeWrites({ ctx }) || params.no_billing_changes === true;

	const skipBillingChanges =
		skipBillingFetching || params.processor_subscription_id !== undefined;

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
		params,
		newBillingSubscription: shouldForceNewSubscription,
		skipBillingFetching,
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
	const isCustom = hasCustomItems(params.customize);

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
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
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

	const endOfCycleMs =
		contextOverride.endOfCycleMsOverride ??
		setupAttachEndOfCycleMs({
			planTiming,
			currentCustomerProduct,
			stripeSubscription,
			billingCycleAnchorMs,
			currentEpochMs,
		});

	const hasFutureStartDate =
		params.start_date !== undefined &&
		params.start_date > currentEpochMs + ms.minutes(1);

	const checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
		attachProduct,
		stripeSubscription,
		trialContext,
		invoiceMode,
		hasFutureStartDate,
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
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		requestedProrationBehavior: isOneOffProduct({
			prices: attachProduct.prices,
		})
			? undefined
			: params.proration_behavior,

		invoiceMode,
		enablePlanImmediately: params.enable_plan_immediately ?? false,

		customPrices,
		customEnts,
		isCustom,
		trialContext,

		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),

		billingVersion: contextOverride.billingVersion ?? BillingVersion.V2,
		successUrl:
			params.success_url ?? orgToReturnUrl({ org: ctx.org, env: ctx.env }),
		checkoutSessionParams: params.checkout_session_params,
		userMetadata: params.metadata,

		externalId: params.subscription_id,

		skipBillingChanges,

		anchorResetRefund: setupAnchorResetRefund({
			billingCycleAnchor: params.billing_cycle_anchor,
			prorationBehavior: params.proration_behavior,
			outgoingCustomerProduct: currentCustomerProduct,
			carryOverBalances: params.carry_over_balances,
		}),
	};
};
