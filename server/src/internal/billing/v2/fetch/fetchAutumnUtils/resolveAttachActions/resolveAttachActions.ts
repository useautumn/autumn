import type {
	CusProductActions,
	FullCustomer,
	FullProduct,
	NewProductAction,
} from "@autumn/shared";

import { getUncancelAttachActions } from "./getUncancelAttachActions";
import { resolveNewProductTiming } from "./resolveNewProductTiming";
import { resolveOngoingCusProductAction } from "./resolveOngoingCusProductAction";
import { resolveScheduledCusProductAction } from "./resolveScheduledCusProductAction";

export const resolveAttachActions = ({
	fullCus,
	products,
}: {
	fullCus: FullCustomer;
	products: FullProduct[];
}): CusProductActions => {
	// SHORT CIRCUIT 1: Multiple products:
	const product = products[0];

	// SHORT CIRCUIT 2: Uncancelling ongoing cus product:
	const uncancelAttachActions = getUncancelAttachActions({
		fullCus,
		product,
	});

	if (uncancelAttachActions) return uncancelAttachActions;

	// 1. Resolve new product timing:
	const newProductTiming = resolveNewProductTiming({
		fullCus,
		product,
	});

	// 2. Resolve ongoing cus product action:
	const ongoingCusProductAction = resolveOngoingCusProductAction({
		fullCus,
		product,
		newProductTiming,
	});

	// 3. Resolve scheduled cus product action:
	const scheduledCusProductAction = resolveScheduledCusProductAction({
		fullCus,
		product,
		newProductTiming,
	});

	// 4. Resolve new products action:
	const newProductAction: NewProductAction = {
		timing: newProductTiming,
		product,
	};

	return {
		ongoingCusProductAction: ongoingCusProductAction,
		scheduledCusProductAction,
		newProductActions: [newProductAction],
	};
};
