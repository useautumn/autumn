import {
	BillingVersion,
	hasCustomItems,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupDefaultProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupDefaultProductContext";
import { setupUpdateSubscriptionProductContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionProductContext";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
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

	const { customerProduct, fullProduct, customPrices, customEnts } =
		await setupUpdateSubscriptionProductContext({
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
		contextOverride,
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
	const isCustom = hasCustomItems(params.customize);

	const defaultProduct = await setupDefaultProductContext({
		ctx,
		params,
		customerProduct,
	});

	const cancelAction = setupCancelAction({ params });

	const billingRelatedFields = Object.keys(params).filter((key) =>
		FIELDS_WITH_BILLING_CHANGES.includes(
			key as (typeof FIELDS_WITH_BILLING_CHANGES)[number],
		),
	);

	let checkoutMode = setupAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
		attachProduct: fullProduct,
		stripeSubscription,
		trialContext,
		invoiceMode,
	});

	checkoutMode =
		params.redirect_mode === "always" && Boolean(checkoutMode)
			? checkoutMode
			: null; // For update subscription, always use autumn_checkout for now

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
		isCustom,

		billingVersion: contextOverride.billingVersion
			? contextOverride.billingVersion
			: (customerProduct.billing_version ?? BillingVersion.V2),

		skipBillingChanges:
			params.no_billing_changes === true ||
			params.processor_subscription_id !== undefined ||
			billingRelatedFields.length === 0,

		checkoutMode,
	};
};
