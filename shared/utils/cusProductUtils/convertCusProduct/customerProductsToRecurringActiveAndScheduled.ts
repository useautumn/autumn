import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";
import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import {
	customerProductHasActiveStatus,
	isCustomerProductOneOff,
} from "../classifyCustomerProduct/classifyCustomerProduct";

/** Split customer products into recurring-active and recurring-scheduled buckets. */
export const customerProductsToRecurringActiveAndScheduled = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): {
	recurringActive: FullCusProduct[];
	recurringScheduled: FullCusProduct[];
} => {
	const recurringActive: FullCusProduct[] = [];
	const recurringScheduled: FullCusProduct[] = [];

	for (const customerProduct of customerProducts) {
		if (isCustomerProductOneOff(customerProduct)) continue;

		if (customerProductHasActiveStatus(customerProduct)) {
			recurringActive.push(customerProduct);
		} else if (customerProduct.status === CusProductStatus.Scheduled) {
			recurringScheduled.push(customerProduct);
		}
	}

	return { recurringActive, recurringScheduled };
};
