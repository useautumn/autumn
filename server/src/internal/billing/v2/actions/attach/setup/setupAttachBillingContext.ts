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
	isFutureStartDate,
	isOneOffProduct,
	isPastStartDate,
	notNullish,
	orgDisableStripeWrites,
	orgToReturnUrl,
	resolveCustomerCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupCustomerLicenseBillingContext } from "@/internal/billing/v2/setup/customerLicenseBillingContext/setupCustomerLicenseBillingContext";
import { fetchStoredLineItemsForSubscriptionBilling } from "@/internal/billing/v2/setup/fetchStoredLineItemsForSubscriptionBilling";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFinalizeFirstInvoice } from "@/internal/billing/v2/setup/setupFinalizeFirstInvoice";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupPaymentBehaviorIntent } from "@/internal/billing/v2/setup/setupPaymentBehaviorIntent";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupTransitionConfigs } from "@/internal/billing/v2/setup/setupTransitionConfigs";
import { setupAdjustableQuantities } from "../../../setup/setupAdjustableQuantities";
import { setupAnchorResetRefund } from "../../../setup/setupAnchorResetRefund";
import { setupIgnoreProrationBehavior } from "../../../setup/setupIgnoreProrationBehavior";
import { getAttachAccessStartsAt } from "./getAttachAccessStartsAt";
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
	preview = false,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	preview?: boolean;
	contextOverride?: BillingContextOverride;
}): Promise<AttachBillingContext> => {
	const { fullCustomer: fullCustomerOverride } = contextOverride;

	// fullCustomer must resolve before the product context so patch-style customize
	// (add_items/remove_items) routes through setupAttachPatchProductContext, matching
	// multiAttach (setupImmediateMultiProductBillingContext) and createSchedule.
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
		insertPlanLicenses,
	} = await setupAttachProductContext({
		ctx,
		params,
		contextOverride,
		fullCustomer,
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

	// no_billing_changes blocks WRITES but should still allow reading the
	// existing Stripe sub when one is linked — needed so the new cusProduct
	// inherits subscription_ids and the paid-product guard doesn't misfire.
	// External-PSP origin callers (e.g. RevenueCat) opt out of fetching
	// entirely via `contextOverride.skipBillingFetching`.
	const skipBillingFetching =
		orgDisableStripeWrites({ ctx }) ||
		contextOverride.skipBillingFetching === true;

	const skipBillingChangesBase =
		skipBillingFetching ||
		params.no_billing_changes === true ||
		params.processor_subscription_id !== undefined;

	const {
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		stripeDiscounts,
		stripeTaxRate,
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
		createStripeCustomerIfMissing:
			!preview && params.no_billing_changes !== true,
		fetchTaxRate: preview,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct: attachProduct,
		currentCustomerProduct: currentCustomerProduct,
		initializeUndefinedQuantities: true,
		contextOverride,
	});

	const customerLicenseQuantities = setupCustomerLicenseQuantityContext({
		params,
	});

	const invoiceMode = await setupInvoiceModeContext({ ctx, params });
	const paymentBehaviorIntent = setupPaymentBehaviorIntent({
		contextOverride,
		paymentMethod,
	});
	const shouldFinalizeFirstInvoice = setupFinalizeFirstInvoice({
		contextOverride,
		invoiceMode,
	});
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

	const skipBillingChanges =
		skipBillingChangesBase || trialContext?.onEnd === "revert";

	let billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: currentCustomerProduct,
		newFullProduct: attachProduct,
		trialContext,
		currentEpochMs,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		billingStartsAt: params.starts_at,
	});

	// Trial ends at overrides billing cycle anchor
	if (trialContext?.trialEndsAt) {
		billingCycleAnchorMs = trialContext.trialEndsAt;
	}

	const endOfCycleMs =
		contextOverride.endOfCycleMsOverride ??
		setupAttachEndOfCycleMs({
			planTiming,
			currentCustomerProduct,
			stripeSubscription,
			billingCycleAnchorMs,
			currentEpochMs,
		});

	const billingStartsAt =
		params.starts_at ??
		(planTiming === "end_of_cycle" ? endOfCycleMs : undefined);

	const hasFutureStartDate = isFutureStartDate(
		params.starts_at,
		currentEpochMs,
	);

	const subscriptionBackdateStartMs =
		params.starts_at !== undefined &&
		isPastStartDate(params.starts_at, currentEpochMs)
			? params.starts_at
			: undefined;

	const accessStartsAt = getAttachAccessStartsAt({
		params,
		currentEpochMs,
	});

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct: undefined, // don't pass in current customer product here (paid products should have the reset cycle anchor correctly...)
		newFullProduct: attachProduct,
		billingStartsAt,
	});

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

	const outgoingCusProductIds = currentCustomerProduct
		? [currentCustomerProduct.id]
		: [];
	const { storedChargeLineItems, storedRefundLineItems } =
		await fetchStoredLineItemsForSubscriptionBilling({
			db: ctx.db,
			fullCustomer,
			stripeSubscription,
			outgoingCusProductIds,
		});

	const customerLicenseBillingContext =
		await setupCustomerLicenseBillingContext({ ctx, fullCustomer });

	return {
		fullCustomer,
		fullProducts: [attachProduct],
		attachProduct,
		currency: resolveCustomerCurrency({
			customer: fullCustomer,
			org: ctx.org,
			requested: params.currency,
			stripeCurrency: stripeCustomer?.currency,
		}),
		featureQuantities,
		customerLicenseQuantities,
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
		stripeTaxRate,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		billingStartsAt,
		subscriptionBackdateStartMs,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		requestedProrationBehavior: setupIgnoreProrationBehavior({
			isOneOffAttach: isOneOffProduct({ prices: attachProduct.prices }),
		})
			? undefined
			: params.proration_behavior,

		invoiceMode,
		paymentBehaviorIntent,
		shouldFinalizeFirstInvoice,
		skipCustomPaymentMethodGuard: contextOverride.skipCustomPaymentMethodGuard,
		skipExternalPSPGuard: contextOverride.skipExternalPSPGuard,
		processorTypeOverride: contextOverride.processorTypeOverride,
		enablePlanImmediately: params.enable_plan_immediately ?? false,
		accessStartsAt,

		customPrices,
		customEnts,
		isCustom,
		trialContext,

		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),

		billingVersion: contextOverride.billingVersion ?? BillingVersion.V2,
		actionSource: "attach",
		successUrl:
			params.success_url ?? orgToReturnUrl({ org: ctx.org, env: ctx.env }),
		checkoutSessionParams: params.checkout_session_params,
		userMetadata: params.metadata,
		taxRateId: params.tax_rate_id,

		externalId: params.subscription_id,
		insertPlanLicenses,

		skipBillingChanges,
		dryRunStripe: preview,

		storedChargeLineItems,
		storedRefundLineItems,
		customerLicenseBillingContext,

		anchorResetRefund: setupAnchorResetRefund({
			billingCycleAnchor: params.billing_cycle_anchor,
			prorationBehavior: params.proration_behavior,
			outgoingCustomerProduct: currentCustomerProduct,
			carryOverBalances: params.carry_over_balances,
		}),
	};
};
