import type {
	AttachParamsV1,
	DeferredAutumnBillingPlanData,
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { handleUnknownFeatureQuantityErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUnknownFeatureQuantityErrors";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { getPendingPlanLongLivedCheckout } from "@/internal/billing/v2/execute/pendingCustomerProducts/getPendingPlanLongLivedCheckout";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingPlanRebills";
import { isPlanEnabledOnFinalize } from "@/internal/billing/v2/utils/billingContext/isPlanEnabledOnFinalize";

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

	const replacementPreview = await billingActions.attach({
		ctx,
		params: attachParams,
		preview: true,
	});

	const replacementProduct =
		replacementPreview.billingContext?.fullProducts?.[0];
	// Checked here, before a rebilling edit discards the pending payment for an attach that would drop the quantity.
	if (replacementProduct)
		handleUnknownFeatureQuantityErrors({
			fullProduct: replacementProduct,
			params,
		});

	const enablesNow =
		params.invoice_mode?.enable_plan_immediately === true &&
		!isPlanEnabledOnFinalize({ billingContext: deferredData.billingContext });
	const rebills =
		enablesNow ||
		pendingPlanRebills({
			ctx,
			customerProduct,
			replacementProduct,
			replacementQuantities:
				replacementPreview.billingContext?.featureQuantities ?? [],
		});

	return { attachParams, longLivedCheckout, replacementPreview, rebills };
};
