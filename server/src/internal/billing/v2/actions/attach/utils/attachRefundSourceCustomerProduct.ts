import type {
	AttachBillingContext,
	AttachParamsV1,
	FullCusProduct,
} from "@autumn/shared";
import { findActiveCustomerProductById } from "@autumn/shared";

/**
 * The plan whose unused time a refund would come from: the plan being
 * transitioned away from, or a plan removed cross-group by this attach.
 */
export const attachRefundSourceCustomerProduct = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}): FullCusProduct | undefined => {
	const { currentCustomerProduct, fullCustomer } = billingContext;

	if (currentCustomerProduct) return currentCustomerProduct;

	const removedPlanId = (params.remove_plan_ids ?? []).find(
		(planId) => planId !== params.plan_id,
	);

	if (!removedPlanId) return undefined;

	return findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: removedPlanId,
	});
};
