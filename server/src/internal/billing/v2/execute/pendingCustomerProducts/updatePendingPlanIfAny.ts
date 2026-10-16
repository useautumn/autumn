import type {
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import {
	type PendingUpdateResult,
	updatePendingCustomerProduct,
} from "@/internal/billing/v2/execute/pendingCustomerProducts/updatePendingCustomerProduct";

export const updatePendingPlanIfAny = async ({
	ctx,
	params,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct?: FullCusProduct;
}): Promise<PendingUpdateResult | undefined> => {
	const pendingCustomerProduct =
		customerProduct ??
		(await findPendingCustomerProduct({
			ctx,
			customerId: params.customer_id,
			productId: params.plan_id,
			entityId: params.entity_id,
			customerProductId: params.customer_product_id,
			subscriptionId: params.subscription_id,
		}));

	if (!pendingCustomerProduct) return;

	return await updatePendingCustomerProduct({
		ctx,
		params,
		customerProduct: pendingCustomerProduct,
	});
};
