import {
	ACTIVE_STATUSES,
	cp,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { getDeferredBillingPlanData } from "@/internal/billing/v2/execute/pendingCustomerProducts/getDeferredBillingPlanData";
import { CusService } from "@/internal/customers/CusService";

/** A pending row replacing a live one (same plan, scope and subscription) is an unpaid change to it,
 * so the request updates the live plan instead and supersedes the pending row. */
export const pendingReplacementToLiveUpdate = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<
	| {
			params: UpdateSubscriptionV1Params;
			contextOverride: UpdateSubscriptionBillingContextOverride;
	  }
	| undefined
> => {
	const customerProduct = await findPendingCustomerProduct({
		ctx,
		customerId: params.customer_id,
		productId: params.plan_id,
		entityId: params.entity_id,
		customerProductId: params.customer_product_id,
		subscriptionId: params.subscription_id,
	});
	const stripeSubscriptionId = customerProduct?.subscription_ids?.[0];
	if (!customerProduct || !stripeSubscriptionId) return;

	const deferredData = await getDeferredBillingPlanData({
		ctx,
		customerProduct,
	});
	if (!deferredData) return;

	const { customer_products } = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		inStatuses: ACTIVE_STATUSES,
		withEntities: false,
		entityId: params.entity_id,
	});
	const livePlan = customer_products.find(
		(live) =>
			cp(live)
				.hasProductId({ productId: customerProduct.product.id })
				.onEntity({
					internalEntityId: customerProduct.internal_entity_id ?? undefined,
				})
				.onStripeSubscription({ stripeSubscriptionId }).valid,
	);
	if (!livePlan) return;

	const contextOverride = { supersededPendingCustomerProduct: customerProduct };
	const { customer_id, entity_id } = params;

	// Cancelling only discards the pending change: the live plan updates to itself.
	if (params.cancel_action) {
		return {
			params: { customer_id, entity_id, customer_product_id: livePlan.id },
			contextOverride,
		};
	}

	const pendingChange = buildPendingReattachParams({
		ctx,
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});
	return {
		params: {
			...params,
			customer_product_id: livePlan.id,
			feature_quantities: pendingChange.feature_quantities,
			customize: pendingChange.customize,
			invoice_mode: params.invoice_mode ?? pendingChange.invoice_mode,
		},
		contextOverride,
	};
};
