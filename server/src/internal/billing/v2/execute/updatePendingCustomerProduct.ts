import type {
	BillingResult,
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/buildPendingReattachParams";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/discardPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/getDeferredBillingPlanData";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingPlanRebills";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

type PendingUpdateResult = {
	billingContext?: UpdateSubscriptionBillingContext;
	billingResult?: BillingResult;
} | null;

/** A plan awaiting payment was never billed, so an edit re-runs the attach that
 * created it and a cancel simply drops it. Either way the original payment is
 * closed first, so the customer cannot pay for a plan that no longer exists. */
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

	// Build the replacement first: if it only changes entitlements, the invoice
	// the customer already has still describes what they owe, so it stands.
	const preview = await billingActions.attach({
		ctx,
		params: reattachParams,
		preview: true,
	});

	const rebills = pendingPlanRebills({
		ctx,
		customerProduct,
		replacementProduct: preview.billingContext?.fullProducts?.[0],
		replacementQuantities: preview.billingContext?.featureQuantities ?? [],
	});

	if (!rebills) return null;

	await discardPendingCustomerProduct({ ctx, customerProduct });

	const { billingContext, billingResult } = await billingActions.attach({
		ctx,
		params: reattachParams,
	});

	if (!billingResult) return {};

	// The replacement stands in for the original, so it keeps the date the
	// customer was first invoiced rather than the date of this edit.
	const replacement = await CusProductService.getByMetadataId({
		db: ctx.db,
		metadataId: billingResult.stripe.deferredMetadataId ?? "",
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Pending],
	});

	for (const row of replacement) {
		await CusProductService.update({
			ctx,
			cusProductId: row.id,
			updates: { created_at: customerProduct.created_at },
		});
	}

	return {
		billingContext:
			billingContext as unknown as UpdateSubscriptionBillingContext,
		billingResult,
	};
};
