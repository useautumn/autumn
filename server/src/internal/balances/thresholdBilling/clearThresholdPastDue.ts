import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyThresholdBlock } from "./applyThresholdBlock.js";
import { selectThresholdBlockedProducts } from "./selectThresholdBlockedProducts.js";

export const clearThresholdPastDue = async ({
	ctx,
	fullCustomer,
	customerProductId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProductId?: string;
}): Promise<void> => {
	const customerId = fullCustomer.id;
	if (!customerId) return;

	await applyThresholdBlock({
		ctx,
		customerId,
		customerProducts: selectThresholdBlockedProducts({
			fullCustomer,
			customerProductId,
		}),
		fullCustomer,
		status: CusProductStatus.Active,
		source: "threshold-billing-recovered",
	});
};
