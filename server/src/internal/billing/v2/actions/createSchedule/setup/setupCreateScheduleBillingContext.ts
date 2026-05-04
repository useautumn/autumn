import {
	type CheckoutMode,
	type CreateScheduleBillingContext,
	type CreateScheduleParamsV0,
	isOneOffProduct,
	isProductPaidAndRecurring,
	type MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";
import { normalizeCreateSchedulePhases } from "../errors/normalizeCreateSchedulePhases";
import { validateCreateSchedulePhasePlans } from "../errors/validateCreateSchedulePhasePlans";
import { billingContextToRecurringAndScheduled } from "../utils/billingContextToRecurringAndScheduled";
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
		hasOneOffProduct || (!hasExistingSubscription && hasPaidRecurringProduct);

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
		enable_plan_immediately: params.enable_plan_immediately,
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

	const scheduleBillingContext: CreateScheduleBillingContext = {
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
		requestedProrationBehavior: params.billing_behavior,
		requestedBillingCycleAnchor: params.billing_cycle_anchor,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
	};

	const { recurringActive } = billingContextToRecurringAndScheduled({
		billingContext: scheduleBillingContext,
	});

	// setupImmediateMultiProductBillingContext does not forward
	// `billing_cycle_anchor`, so billingCycleAnchorMs still reflects the existing
	// Stripe anchor. When the caller asks to reset the cycle we must recompute
	// the anchor (and the reset-cycle anchor) so downstream proration math runs
	// against the new `[now, now + interval]` period. Mirrors the attach /
	// updateSubscription setups.
	if (params.billing_cycle_anchor !== undefined) {
		const firstProduct = billingContext.fullProducts[0];
		if (firstProduct) {
			let recomputedAnchor = setupBillingCycleAnchor({
				stripeSubscription: billingContext.stripeSubscription,
				customerProduct: recurringActive[0],
				newFullProduct: firstProduct,
				trialContext: billingContext.trialContext,
				currentEpochMs: billingContext.currentEpochMs,
				requestedBillingCycleAnchor: params.billing_cycle_anchor,
			});
			if (billingContext.trialContext?.trialEndsAt) {
				recomputedAnchor = billingContext.trialContext.trialEndsAt;
			}
			scheduleBillingContext.billingCycleAnchorMs = recomputedAnchor;
			scheduleBillingContext.resetCycleAnchorMs = setupResetCycleAnchor({
				billingCycleAnchorMs: recomputedAnchor,
				customerProduct: undefined,
				newFullProduct: firstProduct,
			});
		}
	}

	// Keep forward-looking charges (e.g. prepaid renewals) when the caller asks
	// to reset the cycle with proration off; without this, finalizeLineItems
	// drops every line item and total due now collapses to 0.
	scheduleBillingContext.anchorResetRefund = setupAnchorResetRefund({
		billingCycleAnchor: params.billing_cycle_anchor,
		prorationBehavior: params.billing_behavior,
		outgoingCustomerProduct: recurringActive[0],
	});

	return scheduleBillingContext;
};
