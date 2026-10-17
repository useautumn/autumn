import {
	UpdateSubscriptionPreviewIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/pendingCustomerProducts/getDeferredBillingPlanData";
import { previewPendingReattach } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingReattach";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";

/** Previews an edit that re-attaches a pending plan, mirroring updatePendingPlanIfAny. */
export const previewPendingPlanIfAny = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}) => {
	if (params.cancel_action) return;

	const customerProduct = await findPendingCustomerProduct({
		ctx,
		customerId: params.customer_id,
		productId: params.plan_id,
		entityId: params.entity_id,
		customerProductId: params.customer_product_id,
		subscriptionId: params.subscription_id,
	});
	if (!customerProduct) return;

	const deferredData = await getDeferredBillingPlanData({
		ctx,
		customerProduct,
	});
	if (!deferredData) return;

	const { replacementPreview, rebills } = await previewPendingReattach({
		ctx,
		params,
		customerProduct,
		deferredData,
	});
	const { billingContext, billingPlan, approval } = replacementPreview;
	if (!rebills || !billingPlan) return;

	// The edit re-attaches the plan, so it previews as a plan update at the full new price.
	const preview = await billingPlanToUpdateSubscriptionPreview({
		ctx,
		billingContext,
		billingPlan,
		intent: UpdateSubscriptionPreviewIntent.UpdatePlan,
	});
	return { preview, approval };
};
