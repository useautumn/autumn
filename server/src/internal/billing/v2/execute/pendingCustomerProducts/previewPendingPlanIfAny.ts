import {
	UpdateSubscriptionPreviewIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/pendingCustomerProducts/getDeferredBillingPlanData";
import {
	findLivePlanReplacedByPending,
	pendingReplacementToLiveUpdateParams,
} from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingReplacement";
import { previewPendingReattach } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingReattach";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreviewIntent";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Previews an edit or cancel of a pending plan, mirroring updatePendingPlanIfAny. */
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

	const livePlan = await findLivePlanReplacedByPending({
		ctx,
		params,
		customerProduct,
	});
	if (livePlan) {
		// A cancel discards the unpaid change, leaving the live plan exactly as it is.
		const liveParams = params.cancel_action
			? {
					customer_id: params.customer_id,
					entity_id: params.entity_id,
					customer_product_id: livePlan.id,
					plan_id: livePlan.product.id,
				}
			: pendingReplacementToLiveUpdateParams({
					ctx,
					params,
					customerProduct,
					deferredData,
					livePlan,
				});
		const { billingContext, billingPlan } =
			await billingActions.updateSubscription({
				ctx,
				params: liveParams,
				preview: true,
				contextOverride: {
					discardedStripeInvoiceId:
						(
							await MetadataService.get({
								db: ctx.db,
								id: customerProduct.metadata_id!,
							})
						)?.stripe_invoice_id ?? undefined,
				},
			});
		if (!billingPlan) return;
		return billingPlanToUpdateSubscriptionPreview({
			ctx,
			billingContext,
			billingPlan,
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
