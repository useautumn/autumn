import type { UpdateSubscriptionV1Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findEditablePendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findEditablePendingCustomerProduct";
import {
	type PendingUpdateResult,
	updatePendingCustomerProduct,
} from "@/internal/billing/v2/execute/pendingCustomerProducts/updatePendingCustomerProduct";

export const updatePendingPlanIfAny = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
}): Promise<PendingUpdateResult | undefined> => {
	const customerProduct = await findEditablePendingCustomerProduct({
		ctx,
		params,
	});

	if (!customerProduct) return;

	return await updatePendingCustomerProduct({ ctx, params, customerProduct });
};
