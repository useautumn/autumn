import {
	BillingVersion,
	hasCustomItems,
	orgDisableStripeWrites,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupDefaultProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupDefaultProductContext";
import { setupUpdateSubscriptionProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionProductContext";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupAdjustableQuantities } from "@/internal/billing/v2/setup/setupAdjustableQuantities";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupCancelAction } from "@/internal/billing/v2/setup/setupCancelMode";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupAttachCheckoutMode } from "../../attach/setup/setupAttachCheckoutMode";
import { setupUpdateSubscriptionIntent } from "./setupUpdateSubscriptionIntent";
import { setupUpdateSubscriptionTrialContext } from "./setupUpdateSubscriptionTrialContext";

const FIELDS_WITH_BILLING_CHANGES = [
	"feature_quantities",
	"version",
	"customize",
	"cancel_action",
	"billing_cycle_anchor",
	"discounts",
] as const satisfies (keyof UpdateSubscriptionV1Params)[];

/**
 * Fetch the context for updating a subscription
 * @param ctx - The context
 * @param body - The body of the request
 * @returns The update subscription context
 */
export const setupUpdateSubscriptionBillingContext = async ({
	ctx,
	params,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
}): Promise<UpdateSubscriptionBillingContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});

	const {
		customerProduct,
		fullProduct,
		customPrices,
		customEnts,
		isUpdatingFreeCustomerProduct,
	} = await setupUpdateSubscriptionProductContext({
		ctx,
		fullCustomer,
		params,
		contextOverride,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: params,
		fullProduct,
		currentCustomerProduct: customerProduct,
		contextOverride,
		initializeUndefinedQuantities: true,
	});

	const billingRelatedFields = Object.keys(params).filter((key) =>
		FIELDS_WITH_BILLING_CHANGES.includes(
			key as (typeof FIELDS_WITH_BILLING_CHANGES)[number],
		),
	);

	const skipBillingFetching =
		orgDisableStripeWrites({ ctx }) ||
		params.no_billing_changes === true ||
		billingRelatedFields.length === 0 ||
		isUpdatingFreeCustomerProduct;

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
		targetCustomerProduct: customerProduct,
		contextOverride,
		params,
		skipBillingFetching,
		product: fullProduct,
		skipSubscriptionFetching: isUpdatingFreeCustomerProduct,
	});

	const currentEpochMs = testClockFrozenTime ?? Date.now();

	// 1. Setup trial context first
	const trialContext = setupUpdateSubscriptionTrialContext({
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
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
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
	const isCustom =
		contextOverride.forceIsCustom !== undefined
			? contextOverride.forceIsCustom
			: hasCustomItems(params.customize);

	const defaultProduct = await setupDefaultProductContext({
		ctx,
		params,
		customerProduct,
	});

	const cancelAction = setupCancelAction({ params });

	let checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode ?? "if_required",
		attachProduct: fullProduct,
		stripeSubscription,
		trialContext,
		invoiceMode,
	});

	checkoutMode =
		params.redirect_mode === "always" && checkoutMode ? checkoutMode : null; // For update subscription, always use autumn_checkout for now

	const intent = setupUpdateSubscriptionIntent({
		params,
		checkoutMode,
		customerProduct,
	});

	return {
		intent,
		fullCustomer,
		fullProducts: [fullProduct],
		customerProduct,
		defaultProduct,
		cancelAction,
		recalculateBalances: params.recalculate_balances?.enabled === true,
		refundLastPayment: params.refund_last_payment,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		stripeCustomer,
		paymentMethod,

		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		requestedProrationBehavior: params.proration_behavior,

		invoiceMode,
		featureQuantities,
		adjustableFeatureQuantities: setupAdjustableQuantities({ params }),

		customPrices,
		customEnts,
		trialContext,
		isCustom,

		billingVersion: contextOverride.billingVersion ?? BillingVersion.V2,

		actionSource: "updateSubscription",

		skipBillingChanges,

		checkoutMode,

		anchorResetRefund: setupAnchorResetRefund({
			billingCycleAnchor: params.billing_cycle_anchor,
			prorationBehavior: params.proration_behavior,
			outgoingCustomerProduct: customerProduct,
		}),

		chargeExistingOverages: contextOverride.chargeExistingOverages,
		skipExistingUsageCarry: contextOverride.skipExistingUsageCarry,
	};
};
