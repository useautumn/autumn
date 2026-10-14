import {
	ACTIVE_STATUSES,
	type DeferredAutumnBillingPlanData,
	type FullCusProduct,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { CusService } from "@/internal/customers/CusService";

/** The live plan an unpaid change was made to: same plan, same scope, same Stripe subscription. */
export const findLivePlanReplacedByPending = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		inStatuses: ACTIVE_STATUSES,
		withEntities: false,
		entityId: params.entity_id,
	});

	return fullCustomer.customer_products.find(
		(live) =>
			live.id !== customerProduct.id &&
			live.product.id === customerProduct.product.id &&
			(live.internal_entity_id ?? null) ===
				(customerProduct.internal_entity_id ?? null) &&
			live.subscription_ids?.some((subscriptionId) =>
				customerProduct.subscription_ids?.includes(subscriptionId),
			),
	);
};

/** An edit to the unpaid change becomes an update of the live plan, carrying the change's own version, items, quantities and invoicing. */
export const pendingReplacementToLiveUpdateParams = ({
	ctx,
	params,
	customerProduct,
	deferredData,
	livePlan,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	deferredData: DeferredAutumnBillingPlanData;
	livePlan: FullCusProduct;
}): UpdateSubscriptionV1Params => {
	const pendingChange = buildPendingReattachParams({
		ctx,
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});
	const pendingVersion = customerProduct.product.version;

	return {
		...params,
		customer_product_id: livePlan.id,
		feature_quantities: pendingChange.feature_quantities,
		customize: pendingChange.customize,
		invoice_mode: params.invoice_mode ?? pendingChange.invoice_mode,
		version:
			params.version ??
			(pendingVersion !== livePlan.product.version
				? pendingVersion
				: undefined),
	};
};
