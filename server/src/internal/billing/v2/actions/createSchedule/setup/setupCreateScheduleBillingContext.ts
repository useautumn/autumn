import {
	isOneOffProduct,
	isProductPaidAndRecurring,
	type CheckoutMode,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { normalizeCreateSchedulePhases } from "../errors/normalizeCreateSchedulePhases";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";
import { setupScheduledProductsContext } from "./setupScheduledProductsContext";

type CreateScheduleCheckoutModeContext = Pick<
	CreateScheduleBillingContext,
	| "fullProducts"
	| "paymentMethod"
	| "stripeSubscription"
	| "trialContext"
	| "invoiceMode"
>;

const setupCreateScheduleCheckoutMode = ({
	billingContext,
	redirectMode,
}: {
	billingContext: CreateScheduleCheckoutModeContext;
	redirectMode: CreateScheduleParamsV0["redirect_mode"];
}): CheckoutMode => {
	if (redirectMode === "never") {
		return null;
	}

	const hasPaymentMethod = !!billingContext.paymentMethod;
	const hasExistingSubscription = !!billingContext.stripeSubscription;
	const hasOneOffProduct = billingContext.fullProducts.some((product) =>
		isOneOffProduct({ prices: product.prices }),
	);
	const hasPaidRecurringProduct = billingContext.fullProducts.some(
		isProductPaidAndRecurring,
	);
	const shouldUseStripeCheckout =
		hasOneOffProduct ||
		(!hasExistingSubscription && hasPaidRecurringProduct);

	if (
		!billingContext.invoiceMode &&
		!hasPaymentMethod &&
		shouldUseStripeCheckout
	) {
		const noCardRequiredTrial =
			billingContext.trialContext?.trialEndsAt &&
			billingContext.trialContext.cardRequired === false;

		return noCardRequiredTrial ? null : "stripe_checkout";
	}

	if (redirectMode === "always") {
		return shouldUseStripeCheckout ? "stripe_checkout" : "autumn_checkout";
	}

	return null;
};

/** Build billing context for the immediate phase. */
export const setupCreateScheduleBillingContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<CreateScheduleBillingContext> => {
	const normalizedPhases = normalizeCreateSchedulePhases({
		phases: params.phases,
	});
	const [immediatePhase, ...futurePhases] = normalizedPhases;

	const immediateParams = {
		customer_id: params.customer_id,
		entity_id: params.entity_id,
		plans: immediatePhase.plans.map((plan) => ({
			plan_id: plan.plan_id,
			customize: plan.customize,
			feature_quantities: plan.feature_quantities,
			version: plan.version,
		})),
		invoice_mode: params.invoice_mode,
		success_url: params.success_url,
		checkout_session_params: params.checkout_session_params,
		redirect_mode: params.redirect_mode ?? "if_required",
	} satisfies MultiAttachParamsV0;

	const billingContext = await setupImmediateMultiProductBillingContext({
		ctx,
		params: immediateParams,
	});

	validateCreateSchedulePhasePlans({
		fullProducts: billingContext.fullProducts,
	});

	const scheduledPhaseContexts = await setupScheduledProductsContext({
		ctx,
		phases: futurePhases,
	});

	const scheduledCustomPrices = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customPrices,
		),
	);
	const scheduledCustomEntitlements = scheduledPhaseContexts.flatMap((phase) =>
		phase.productContexts.flatMap(
			(productContext) => productContext.customEntitlements,
		),
	);

	return {
		...billingContext,
		checkoutMode: setupCreateScheduleCheckoutMode({
			billingContext,
			redirectMode: params.redirect_mode,
		}),
		customPrices: [
			...(billingContext.customPrices ?? []),
			...scheduledCustomPrices,
		], // combine custom prices from immediate and scheduled phases
		customEnts: [
			...(billingContext.customEnts ?? []),
			...scheduledCustomEntitlements,
		], // combine custom prices and entitlements from immediate and scheduled phases
		isCustom:
			billingContext.isCustom ||
			scheduledCustomPrices.length > 0 ||
			scheduledCustomEntitlements.length > 0,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
	};
};
