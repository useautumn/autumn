import {
	cp,
	cusProductToLineItems,
	type FullCusProduct,
	filterUnchangedPricesFromLineItems,
	type LineItem,
} from "@autumn/shared";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { billingContextHasTrial } from "@/internal/billing/v2/utils/billingContext/billingContextHasTrial";
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
	const { valid: isTrialing } = cp(deletedCustomerProduct).trialing({
		nowMs: currentEpochMs,
	});

	const shouldRefundLineItems = deletedCustomerProduct && !isTrialing;

	const deletedLineItems = shouldRefundLineItems
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
	let allLineItems = [
		...filteredDeletedLineItems,
		...arrearLineItems,
		...filteredNewLineItems,
	];

	// If trialing, don't apply free trial?
	if (billingContextHasTrial({ billingContext })) {
		allLineItems = [
			...filteredDeletedLineItems,
			...arrearLineItems,
			...filteredNewLineItems,
		].map((item) => ({ ...item, amount: 0, finalAmount: 0 }));
	}

	console.log(
		"All line items: ",
		allLineItems.map((item) => ({
			description: item.description,
			amount: item.amount,
			finalAmount: item.finalAmount,
		})),
	);

	return allLineItems;
};
