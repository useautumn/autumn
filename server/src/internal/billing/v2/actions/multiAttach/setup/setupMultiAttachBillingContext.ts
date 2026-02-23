import {
	type AttachParamsV1,
	BillingVersion,
	type MultiAttachBillingContext,
	type MultiAttachParamsV0,
	type MultiAttachProductContext,
	orgToReturnUrl,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupAttachProductContext } from "../../attach/setup/setupAttachProductContext";
import { setupMultiAttachCheckoutMode } from "./setupMultiAttachCheckoutMode";
import { setupMultiAttachTrialContext } from "./setupMultiAttachTrialContext";

/**
 * Assembles the full billing context for attaching multiple products.
 */
export const setupMultiAttachBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: MultiAttachParamsV0;
}): Promise<MultiAttachBillingContext> => {
	// 1. Load customer
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});

	// 2. Load all product contexts in parallel
	const productContexts: MultiAttachProductContext[] = await Promise.all(
		params.plans.map(async (plan) => {
			const { fullProduct, customPrices, customEnts } =
				await setupAttachProductContext({
					ctx,
					params: {
						plan_id: plan.plan_id,
						customize: plan.customize,
						version: plan.version,
						customer_id: params.customer_id,
					} as AttachParamsV1,
				});

			const featureQuantities = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: {
					feature_quantities: plan.feature_quantities,
				},
				fullProduct,
				currentCustomerProduct: undefined,
				initializeUndefinedQuantities: true,
			});

			return {
				fullProduct,
				customPrices: customPrices ?? [],
				customEnts: customEnts ?? [],
				featureQuantities,
			};
		}),
	);

	const fullProducts = productContexts.map((pc) => pc.fullProduct);

	// 3. Setup Stripe context (no target customer product — no transitions)
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
		targetCustomerProduct: undefined,
		paramDiscounts: params.discounts,
	});

	const invoiceMode = setupInvoiceModeContext({
		params,
	});
	const currentEpochMs = testClockFrozenTime ?? Date.now();

	// 4. Setup trial context (top-level free_trial only)
	const trialContext = setupMultiAttachTrialContext({
		freeTrialParam: params.free_trial,
		stripeSubscription,
		fullProducts,
		currentEpochMs,
	});

	// 5. Billing cycle anchor
	const billingCycleAnchorMs: number | "now" =
		trialContext?.trialEndsAt ?? "now";

	const resetCycleAnchorMs = billingCycleAnchorMs ?? "now";

	// 6. Checkout mode
	const checkoutMode = setupMultiAttachCheckoutMode({
		paymentMethod,
		redirectMode: params.redirect_mode,
	});

	// 7. Merge custom prices, entitlements, and adjustable quantities
	const allCustomPrices = productContexts.flatMap((pc) => pc.customPrices);
	const allCustomEnts = productContexts.flatMap((pc) => pc.customEnts);
	const allFeatureQuantities = productContexts.flatMap(
		(pc) => pc.featureQuantities,
	);

	const adjustableFeatureQuantities = params.plans.flatMap(
		(plan) =>
			plan.feature_quantities
				?.filter((fq) => fq.adjustable === true)
				.map((fq) => fq.feature_id) ?? [],
	);

	return {
		fullCustomer,
		fullProducts,
		productContexts,

		featureQuantities: allFeatureQuantities,
		adjustableFeatureQuantities,
		invoiceMode,

		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,

		stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		paymentMethod,

		customPrices: allCustomPrices,
		customEnts: allCustomEnts,
		trialContext,
		isCustom: allCustomPrices.length > 0 || allCustomEnts.length > 0,

		checkoutMode,
		billingVersion: BillingVersion.V2,
		successUrl:
			params.success_url ?? orgToReturnUrl({ org: ctx.org, env: ctx.env }),
	};
};
