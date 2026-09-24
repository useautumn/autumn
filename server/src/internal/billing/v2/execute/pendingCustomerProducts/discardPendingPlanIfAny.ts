import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/discardPendingCustomerProduct";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";

export const discardPendingPlanIfAny = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId?: string;
	entityId?: string;
}) => {
	const customerProduct = await findPendingCustomerProduct({
		ctx,
		customerId,
		productId,
		entityId,
	});

	if (!customerProduct) return false;

	await discardPendingCustomerProduct({ ctx, customerProduct });
	return true;
};
