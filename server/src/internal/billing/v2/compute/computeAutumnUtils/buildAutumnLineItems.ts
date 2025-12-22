import {
	cusProductToArrearLineItems,
	cusProductToLineItems,
	type FullCusProduct,
} from "@autumn/shared";

import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const buildAutumnLineItems = ({
	ctx,
	newCusProducts,
	ongoingCustomerProduct,
	billingCycleAnchor,
	testClockFrozenTime,
}: {
	ctx: AutumnContext;
	newCusProducts: FullCusProduct[];
	ongoingCustomerProduct?: FullCusProduct;
	billingCycleAnchor?: number;
	testClockFrozenTime?: number;
}) => {
	const now = testClockFrozenTime ?? Date.now();
	billingCycleAnchor = billingCycleAnchor ?? now;

	const { org } = ctx;

	const arrearLineItems = ongoingCustomerProduct
		? cusProductToArrearLineItems({
				cusProduct: ongoingCustomerProduct,
				billingCycleAnchor: billingCycleAnchor!,
				now,
				org,
			})
		: [];

	// Get line items for ongoing cus product
	const ongoingLineItems = ongoingCustomerProduct
		? cusProductToLineItems({
				cusProduct: ongoingCustomerProduct,
				now,
				billingCycleAnchor: billingCycleAnchor!,
				direction: "refund",
				org,
			})
		: [];

	const newLineItems = newCusProducts.flatMap((newCusProduct) =>
		cusProductToLineItems({
			cusProduct: newCusProduct,
			now,
			billingCycleAnchor: billingCycleAnchor!,
			direction: "charge",
			org,
		}),
	);

	// All items
	const allLineItems = [
		...ongoingLineItems,
		...arrearLineItems,
		...newLineItems,
	];

	return allLineItems;
};
