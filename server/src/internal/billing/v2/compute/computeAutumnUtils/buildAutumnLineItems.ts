import {
	cusProductToLineItems,
	type FullCusProduct,
	filterUnchangedPricesFromLineItems,
	type LineItem,
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

	// For now, update subscription doesn't charge for existing usage.
	const arrearLineItems: LineItem[] = [];
	// cusProductToArrearLineItems({
	// 	cusProduct: deletedCustomerProduct,
	// 	billingCycleAnchorMs,
	// 	nowMs: currentEpochMs,
	// 	org,
	// })

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

	const {
		deletedLineItems: filteredDeletedLineItems,
		newLineItems: filteredNewLineItems,
	} = filterUnchangedPricesFromLineItems({
		deletedLineItems,
		newLineItems,
	});

	// All items
	const allLineItems = [
		...filteredDeletedLineItems,
		...arrearLineItems,
		...filteredNewLineItems,
	];

	return allLineItems;
};
