import {
	type AttachParamsV1,
	CusProductStatus,
	type DeferredAutumnBillingPlanData,
	type FullCusProduct,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { handleUnknownFeatureQuantityErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUnknownFeatureQuantityErrors";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { getPendingPlanLongLivedCheckout } from "@/internal/billing/v2/execute/pendingCustomerProducts/getPendingPlanLongLivedCheckout";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingPlanRebills";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";

/** A granted plan is only discarded at execution: the preview must not see it attached, and both carry its usage. */
const grantedPlanOverrides = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	customerProduct: FullCusProduct;
}) => {
	const fullCustomer = await setupFullCustomerContext({ ctx, params });
	const carryOverSourceCustomerProduct =
		fullCustomer.customer_products.find(
			({ id }) => id === customerProduct.id,
		) ?? customerProduct;
	return {
		preview: {
			fullCustomer: {
				...fullCustomer,
				customer_products: fullCustomer.customer_products.filter(
					({ id }) => id !== customerProduct.id,
				),
			},
			carryOverSourceCustomerProduct,
		},
		execute: { carryOverSourceCustomerProduct },
	};
};

/** Previews the pending plan re-attached with the edit, and whether that needs a new payment. */
export const previewPendingReattach = async ({
	ctx,
	params,
	customerProduct,
	deferredData,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const reattachParams = buildPendingReattachParams({
		ctx,
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});

	// A plan opened from a long-lived link keeps the link's params (discounts, redirects) under the edit.
	const longLivedCheckout = await getPendingPlanLongLivedCheckout({
		ctx,
		deferredData,
	});
	const attachParams: AttachParamsV1 = longLivedCheckout
		? {
				...(longLivedCheckout.params as AttachParamsV1),
				...reattachParams,
				long_lived_checkout: false,
			}
		: reattachParams;

	const isGranted = customerProduct.status !== CusProductStatus.Pending;
	const overrides = isGranted
		? await grantedPlanOverrides({ ctx, params: attachParams, customerProduct })
		: undefined;
	const replacementPreview = await billingActions.attach({
		ctx,
		params: attachParams,
		preview: true,
		contextOverride: overrides?.preview,
	});

	const replacementProduct =
		replacementPreview.billingContext?.fullProducts?.[0];
	// Checked here, before a rebilling edit discards the pending payment for an attach that would drop the quantity.
	if (replacementProduct)
		handleUnknownFeatureQuantityErrors({
			fullProduct: replacementProduct,
			params,
		});

	const replacementTrialContext =
		replacementPreview.billingContext?.trialContext;
	// A granted plan's payment is tied to its rows by the Stripe session, so any edit re-grants it.
	const rebills =
		isGranted ||
		pendingPlanRebills({
			ctx,
			customerProduct,
			replacementProduct,
			replacementQuantities:
				replacementPreview.billingContext?.featureQuantities ?? [],
			// An explicit free_trial lands on the trial context, not the plan.
			replacementFreeTrial: replacementTrialContext
				? replacementTrialContext.freeTrial
				: replacementProduct?.free_trial,
		});

	return {
		attachParams,
		attachContextOverride: overrides?.execute,
		longLivedCheckout,
		replacementPreview,
		rebills,
	};
};
