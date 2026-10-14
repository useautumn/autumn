import {
	UpdateSubscriptionPreviewIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/pendingCustomerProducts/getDeferredBillingPlanData";
import { pendingReplacementToLiveUpdate } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingReplacement";
import { previewPendingReattach } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingReattach";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreviewIntent";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Previews an edit that re-attaches a pending plan, mirroring updatePendingPlanIfAny. */
export const previewPendingPlanIfAny = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}) => {
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

	const liveUpdate = await pendingReplacementToLiveUpdate({
		ctx,
		params,
		customerProduct,
		deferredData,
	});
	if (liveUpdate) {
		// The update runs after the pending invoice is voided, so its line items don't count.
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id!,
		});
		const { billingContext, billingPlan } =
			await billingActions.updateSubscription({
				ctx,
				params: liveUpdate,
				preview: true,
				contextOverride: {
					discardedStripeInvoiceId: metadata?.stripe_invoice_id ?? undefined,
				},
			});
		return billingPlanToUpdateSubscriptionPreview({
			ctx,
			billingContext,
			billingPlan: billingPlan!,
			intent: billingPlanToUpdateSubscriptionPreviewIntent({ billingContext }),
		});
	}
	if (params.cancel_action) return;

	const { replacementPreview, rebills } = await previewPendingReattach({
		ctx,
		params,
		customerProduct,
		deferredData,
	});
	const { billingContext, billingPlan } = replacementPreview;
	if (!rebills || !billingPlan) return;

	// The edit re-attaches the plan, so it previews as a plan update at the full new price.
	return billingPlanToUpdateSubscriptionPreview({
		ctx,
		billingContext,
		billingPlan,
		intent: UpdateSubscriptionPreviewIntent.UpdatePlan,
	});
};
