import {
	cusProductToArrearLineItems,
	cusProductToLineItems,
	type FullCusProduct,
} from "@autumn/shared";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	billingContext: BillingContext;
}) => {
	// billingCycleAnchor = billingCycleAnchor ?? now;
	const billingCycleAnchor = billingContext.billingCycleAnchorMs;
	const now = billingContext.currentEpochMs;

	const { org } = ctx;

	const arrearLineItems = deletedCustomerProduct
		? cusProductToArrearLineItems({
				cusProduct: deletedCustomerProduct,
				billingCycleAnchor: billingCycleAnchor!,
				now,
				org,
			})
		: [];

	// Get line items for ongoing cus product
	const deletedLineItems = deletedCustomerProduct
		? cusProductToLineItems({
				cusProduct: deletedCustomerProduct,
				now,
				billingCycleAnchor: billingCycleAnchor!,
				direction: "refund",
				org,
			})
		: [];

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		cusProductToLineItems({
			cusProduct: newCustomerProduct,
			now,
			billingCycleAnchor: billingCycleAnchor!,
			direction: "charge",
			org,
		}),
	);

	// All items
	const allLineItems = [
		...deletedLineItems,
		...arrearLineItems,
		...newLineItems,
	];

	return allLineItems;
};
