import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import {
	CusProductStatus,
	customerProductHasActiveStatus,
	isCusProductOnEntity,
	isCustomerProductOneOff,
} from "@autumn/shared";

/** Split the billing context's customer products into recurring-active and recurring-scheduled, scoped to the schedule's entity level. */
export const billingContextToRecurringAndScheduled = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): {
	recurringActive: FullCusProduct[];
	recurringScheduled: FullCusProduct[];
} => {
	const internalEntityId = billingContext.fullCustomer.entity?.internal_id;
	const recurringActive: FullCusProduct[] = [];
	const recurringScheduled: FullCusProduct[] = [];

	for (const customerProduct of billingContext.fullCustomer.customer_products) {
		if (isCustomerProductOneOff(customerProduct)) continue;
		if (
			!isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId })
		)
			continue;

		if (customerProductHasActiveStatus(customerProduct)) {
			recurringActive.push(customerProduct);
		} else if (customerProduct.status === CusProductStatus.Scheduled) {
			recurringScheduled.push(customerProduct);
		}
	}

	return { recurringActive, recurringScheduled };
};
