import type {
	BillingResult,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/findPendingCustomerProduct";
import { updatePendingCustomerProduct } from "@/internal/billing/v2/execute/updatePendingCustomerProduct";

/** Applies an update to the customer's plan awaiting payment, if they have one.
 * Returns nothing when they don't, so the caller falls through to the ordinary
 * update. */
export const updatePendingPlanIfAny = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<
	| {
			billingContext?: UpdateSubscriptionBillingContext;
			billingResult?: BillingResult;
	  }
	| undefined
> => {
	const customerProduct = await findPendingCustomerProduct({
		ctx,
		customerId: params.customer_id,
		productId: params.plan_id,
		entityId: params.entity_id,
	});

	if (!customerProduct) return;

	return await updatePendingCustomerProduct({ ctx, params, customerProduct });
};
