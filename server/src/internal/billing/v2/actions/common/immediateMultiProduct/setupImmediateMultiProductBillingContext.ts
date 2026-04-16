import {
	BillingVersion,
	isOneOffProduct,
	isProductPaidAndRecurring,
	type MultiAttachBillingContext,
	type MultiAttachParamsV0,
	type MultiAttachProductContext,
	orgToReturnUrl,
} from "@autumn/shared";
import type { FreeTrialParamsV1 } from "@shared/api/common/freeTrial/freeTrialParamsV1";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachProductContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachProductContext";
import { setupAttachTransitionContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachTransitionContext";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { setupInvoiceModeContext } from "@/internal/billing/v2/setup/setupInvoiceModeContext";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import {
	applyProductTrialConfig,
	handleFreeTrialParam,
} from "@/internal/billing/v2/setup/trialContext";

/** Resolve checkout mode for immediate multi-product billing. */
const setupImmediateMultiProductCheckoutMode = ({
	paymentMethod,
	redirectMode,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	redirectMode?: MultiAttachParamsV0["redirect_mode"];
}) => {
	if (redirectMode === "never") {
		return null;
	}

	if (paymentMethod) {
		return redirectMode === "always" ? "stripe_checkout" : null;
	}

	return "stripe_checkout";
};

/** Resolve trial behavior for immediate multi-product billing. */
const setupImmediateMultiProductTrialContext = async ({
	ctx,
	freeTrialParam,
	fullCustomer,
	stripeSubscription,
	fullProducts,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	freeTrialParam?: FreeTrialParamsV1 | null;
	fullCustomer: MultiAttachBillingContext["fullCustomer"];
	stripeSubscription?: Stripe.Subscription;
	fullProducts: MultiAttachBillingContext["fullProducts"];
	currentEpochMs: number;
}) => {
	const paidRecurringProduct = fullProducts.find((product) =>
		isProductPaidAndRecurring(product),
	);
	const recurringProduct = fullProducts.find(
		(product) => !isOneOffProduct({ prices: product.prices }),
	);
	const targetProduct =
		paidRecurringProduct ?? recurringProduct ?? fullProducts[0];

	if (!targetProduct) {
		return undefined;
	}

	if (freeTrialParam !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams: freeTrialParam,
			stripeSubscription,
			fullProduct: targetProduct,
			currentEpochMs,
		});
	}

	const productWithTrial = fullProducts.find((product) => product.free_trial);

	if (!productWithTrial) {
		return undefined;
	}

	return applyProductTrialConfig({
		ctx,
		fullProduct: productWithTrial,
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
	});
};

/** Build billing context for immediate multi-product billing. */
export const setupImmediateMultiProductBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: MultiAttachParamsV0;
}): Promise<MultiAttachBillingContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});

	const productContexts: MultiAttachProductContext[] = await Promise.all(
		params.plans.map(async (plan) => {
			const { fullProduct, customPrices, customEnts } =
				await setupAttachProductContext({
					ctx,
					params: {
						customer_id: params.customer_id,
						plan_id: plan.plan_id,
						customize: plan.customize,
						version: plan.version,
					},
				});

			const { currentCustomerProduct, scheduledCustomerProduct } =
				setupAttachTransitionContext({
					fullCustomer,
					attachProduct: fullProduct,
				});

			const featureQuantities = setupFeatureQuantitiesContext({
				ctx,
				featureQuantitiesParams: {
					feature_quantities: plan.feature_quantities,
				},
				fullProduct,
				currentCustomerProduct,
				initializeUndefinedQuantities: true,
			});

			return {
				fullProduct,
				customPrices: customPrices ?? [],
				customEnts: customEnts ?? [],
				featureQuantities,
				currentCustomerProduct,
				scheduledCustomerProduct,
				externalId: plan.subscription_id,
			};
		}),
	);

	const fullProducts = productContexts.map(
		(productContext) => productContext.fullProduct,
	);
	const [firstProduct] = fullProducts;

	if (!firstProduct) {
		throw new Error("setupImmediateMultiProductBillingContext requires plans");
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
		targetCustomerProduct: undefined,
		params,
		skipSubscriptionFetching: fullProducts.every(isOneOffProduct),
		newBillingSubscription: params.new_billing_subscription || undefined,
	});

	const invoiceMode = setupInvoiceModeContext({ params });
	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const trialContext = await setupImmediateMultiProductTrialContext({
		ctx,
		freeTrialParam: params.free_trial,
		fullCustomer,
		stripeSubscription,
		fullProducts,
		currentEpochMs,
	});

	let billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: undefined,
		newFullProduct: firstProduct,
		trialContext,
		currentEpochMs,
	});

	if (trialContext?.trialEndsAt) {
		billingCycleAnchorMs = trialContext.trialEndsAt;
	}

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct: undefined,
		newFullProduct: firstProduct,
	});

	const customPrices = productContexts.flatMap(
		(productContext) => productContext.customPrices,
	);
	const customEnts = productContexts.flatMap(
		(productContext) => productContext.customEnts,
	);

	return {
		fullCustomer,
		fullProducts,
		productContexts,
		featureQuantities: productContexts.flatMap(
			(productContext) => productContext.featureQuantities,
		),
		adjustableFeatureQuantities: params.plans.flatMap(
			(plan) =>
				plan.feature_quantities
					?.filter((featureQuantity) => featureQuantity.adjustable === true)
					.map((featureQuantity) => featureQuantity.feature_id) ?? [],
		),
		invoiceMode,
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		paymentMethod,
		customPrices,
		customEnts,
		trialContext,
		isCustom: customPrices.length > 0 || customEnts.length > 0,
		checkoutMode: setupImmediateMultiProductCheckoutMode({
			paymentMethod,
			redirectMode: params.redirect_mode,
		}),
		billingVersion: BillingVersion.V2,
		successUrl:
			params.success_url ?? orgToReturnUrl({ org: ctx.org, env: ctx.env }),
		checkoutSessionParams: params.checkout_session_params,
	};
};
