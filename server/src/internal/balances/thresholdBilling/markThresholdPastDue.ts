import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyThresholdBlock } from "./applyThresholdBlock.js";

export const markThresholdPastDue = async ({
	ctx,
	customerId,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	if (customerProduct.product.config?.ignore_past_due) return;

	await applyThresholdBlock({
		ctx,
		customerId,
		customerProducts: [customerProduct],
		fullCustomer,
		status: CusProductStatus.PastDue,
		source: "threshold-billing-past-due",
	});
};
