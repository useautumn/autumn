import type {
	BillingResult,
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/discardPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/pendingCustomerProducts/getDeferredBillingPlanData";
import { inheritPendingCreatedAt } from "@/internal/billing/v2/execute/pendingCustomerProducts/inheritPendingCreatedAt";
import { previewPendingReattach } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingReattach";
import { relinkPendingPayment } from "@/internal/billing/v2/execute/pendingCustomerProducts/relinkPendingPayment";
import { checkoutActions } from "@/internal/checkouts/actions";

export type PendingUpdateResult = {
	billingContext?: UpdateSubscriptionBillingContext;
	billingResult?: BillingResult;
};

export const updatePendingCustomerProduct = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
}): Promise<PendingUpdateResult> => {
	const deferredData = await getDeferredBillingPlanData({
		ctx,
		customerProduct,
	});

	if (params.cancel_action || !deferredData) {
		await discardPendingCustomerProduct({ ctx, customerProduct });
		return {};
	}

	const { attachParams, longLivedCheckout, rebills } =
		await previewPendingReattach({
			ctx,
			params,
			customerProduct,
			deferredData,
		});

	if (!rebills) {
		const updated = await billingActions.updateSubscription({
			ctx,
			params,
			preview: false,
		});

		await relinkPendingPayment({
			ctx,
			customerProduct,
			metadataId: customerProduct.metadata_id,
		});

		return updated as PendingUpdateResult;
	}

	await discardPendingCustomerProduct({ ctx, customerProduct });

	const { billingContext, billingResult } = await billingActions.attach({
		ctx,
		params: attachParams,
		approvalRoute: "billing.update",
		longLivedCheckout: longLivedCheckout && {
			id: longLivedCheckout.id,
			expiresAt: longLivedCheckout.expires_at,
		},
	});

	if (!billingResult) return {};

	await inheritPendingCreatedAt({
		ctx,
		metadataId: billingResult.stripe.deferredMetadataId,
		createdAt: customerProduct.created_at,
	});

	const retargetedCheckout =
		longLivedCheckout &&
		(await checkoutActions.retargetLongLived({
			ctx,
			checkout: longLivedCheckout,
			params: attachParams,
			billingContext,
			billingResult,
		}));

	return {
		billingContext:
			billingContext as unknown as UpdateSubscriptionBillingContext,
		billingResult: retargetedCheckout
			? { ...billingResult, autumn: { checkout: retargetedCheckout } }
			: billingResult,
	};
};
