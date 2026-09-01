import type { UpdateSubscriptionV1Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/findPendingCustomerProduct";
import {
	type PendingUpdateResult,
	updatePendingCustomerProduct,
} from "@/internal/billing/v2/execute/updatePendingCustomerProduct";

export const updatePendingPlanIfAny = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<PendingUpdateResult | undefined> => {
	const customerProduct = await findPendingCustomerProduct({
		ctx,
		customerId: params.customer_id,
		productId: params.plan_id,
		entityId: params.entity_id,
	});

	if (!customerProduct) return;

	return await updatePendingCustomerProduct({ ctx, params, customerProduct });
};
