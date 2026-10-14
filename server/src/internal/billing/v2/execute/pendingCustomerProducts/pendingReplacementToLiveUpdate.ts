import {
	ACTIVE_STATUSES,
	type DeferredAutumnBillingPlanData,
	type FullCusProduct,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { CusService } from "@/internal/customers/CusService";

/** A pending row replacing a live one (same plan, scope and subscription) is an unpaid change to it: edits update the live plan instead. */
export const pendingReplacementToLiveUpdate = async ({
	ctx,
	params,
	customerProduct,
	deferredData,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	deferredData: DeferredAutumnBillingPlanData;
}): Promise<UpdateSubscriptionV1Params | undefined> => {
	const { customer_products } = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		inStatuses: ACTIVE_STATUSES,
		withEntities: false,
		entityId: params.entity_id,
	});
	const livePlan = customer_products.find(
		(live) =>
			live.product.id === customerProduct.product.id &&
			live.internal_entity_id === customerProduct.internal_entity_id &&
			live.subscription_ids?.some((id) =>
				customerProduct.subscription_ids?.includes(id),
			),
	);
	if (!livePlan) return;

	// Cancelling only discards the pending change, so the live plan previews unchanged.
	if (params.cancel_action) {
		const { customer_id, entity_id } = params;
		return { customer_id, entity_id, customer_product_id: livePlan.id };
	}

	const pendingChange = buildPendingReattachParams({
		ctx,
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});
	return {
		...params,
		customer_product_id: livePlan.id,
		feature_quantities: pendingChange.feature_quantities,
		customize: pendingChange.customize,
		invoice_mode: params.invoice_mode ?? pendingChange.invoice_mode,
	};
};
