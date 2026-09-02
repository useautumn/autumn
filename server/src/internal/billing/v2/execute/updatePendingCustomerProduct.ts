import type {
	BillingResult,
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/buildPendingReattachParams";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/discardPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/getDeferredBillingPlanData";
import { inheritPendingCreatedAt } from "@/internal/billing/v2/execute/inheritPendingCreatedAt";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingPlanRebills";
import { relinkPendingPayment } from "@/internal/billing/v2/execute/relinkPendingPayment";

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

	const reattachParams = buildPendingReattachParams({
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});

	const replacementPreview = await billingActions.attach({
		ctx,
		params: reattachParams,
		preview: true,
	});

	const rebills = pendingPlanRebills({
		ctx,
		customerProduct,
		replacementProduct: replacementPreview.billingContext?.fullProducts?.[0],
		replacementQuantities:
			replacementPreview.billingContext?.featureQuantities ?? [],
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
		params: reattachParams,
	});

	if (!billingResult) return {};

	await inheritPendingCreatedAt({
		ctx,
		metadataId: billingResult.stripe.deferredMetadataId,
		createdAt: customerProduct.created_at,
	});

	return {
		billingContext:
			billingContext as unknown as UpdateSubscriptionBillingContext,
		billingResult,
	};
};
