import {
	cusProductToArrearLineItems,
	cusProductToLineItems,
	type FullCusProduct,
	type OngoingCusProductAction,
} from "@autumn/shared";

import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const buildAutumnLineItems = ({
	ctx,
	newCusProducts,
	ongoingCusProductAction,
	billingCycleAnchor,
	testClockFrozenTime,
}: {
	ctx: AutumnContext;
	newCusProducts: FullCusProduct[];
	ongoingCusProductAction?: OngoingCusProductAction;
	billingCycleAnchor?: number;
	testClockFrozenTime?: number;
}) => {
	const now = testClockFrozenTime ?? Date.now();
	billingCycleAnchor = billingCycleAnchor ?? now;

	const { org } = ctx;
	const ongoingCusProduct = ongoingCusProductAction?.cusProduct;

	const arrearLineItems = ongoingCusProduct
		? cusProductToArrearLineItems({
				cusProduct: ongoingCusProduct,
				billingCycleAnchor: billingCycleAnchor!,
				now,
				org,
			})
		: [];

	// Get line items for ongoing cus product
	const ongoingLineItems = ongoingCusProduct
		? cusProductToLineItems({
				cusProduct: ongoingCusProduct,
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
