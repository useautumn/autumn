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
	const { billingCycleAnchorMs, currentEpochMs } = billingContext;

	const { org, logger } = ctx;

	const arrearLineItems = deletedCustomerProduct
		? cusProductToArrearLineItems({
				cusProduct: deletedCustomerProduct,
				billingCycleAnchorMs,
				nowMs: currentEpochMs,
				org,
			})
		: [];

	// Get line items for ongoing cus product
	const deletedLineItems = deletedCustomerProduct
		? cusProductToLineItems({
				cusProduct: deletedCustomerProduct,
				nowMs: currentEpochMs,
				billingCycleAnchorMs,
				direction: "refund",
				org,
				logger,
			})
		: [];

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		cusProductToLineItems({
			cusProduct: newCustomerProduct,
			nowMs: currentEpochMs,
			billingCycleAnchorMs,
			direction: "charge",
			org,
			logger,
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
