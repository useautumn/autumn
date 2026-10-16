import type { UpdateSubscriptionV1Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { findUnpaidLongLivedCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findUnpaidLongLivedCustomerProduct";

/** The unpaid plan an edit re-attaches: a pending row, or one a long-lived link granted. */
export const findEditablePendingCustomerProduct = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}) => {
	const target = {
		ctx,
		customerId: params.customer_id,
		productId: params.plan_id,
		entityId: params.entity_id,
		customerProductId: params.customer_product_id,
		subscriptionId: params.subscription_id,
	};
	return (
		(await findPendingCustomerProduct(target)) ??
		(await findUnpaidLongLivedCustomerProduct(target))
	);
};
