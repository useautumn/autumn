import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import {
	customerProductsToRecurringActiveAndScheduled,
	isCusProductOnEntity,
	isCustomerProductAddOn,
} from "@autumn/shared";

/** Split recurring products across scopes represented by the immediate plans. */
export const billingContextToRecurringAndScheduled = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): {
	recurringActive: FullCusProduct[];
	recurringScheduled: FullCusProduct[];
} => {
	const customerProductsById = new Map<string, FullCusProduct>();

	for (const productContext of billingContext.productContexts) {
		const internalEntityId = productContext.entity?.internal_id;
		for (const customerProduct of productContext.scopeCustomerProducts) {
			if (
				isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId })
			) {
				customerProductsById.set(customerProduct.id, customerProduct);
			}
		}
	}

	return customerProductsToRecurringActiveAndScheduled({
		customerProducts: [...customerProductsById.values()],
	});
};

/** Keep persisted phases complete; preserved add-ons are absent from the insert plan. */
export const addPreservedAddOnsToSchedulePhases = ({
	billingContext,
	phases,
}: {
	billingContext: CreateScheduleBillingContext;
	phases: { startsAt: number; customerProductIds: string[] }[];
}) => {
	if (!billingContext.preserveAddOns) return phases;

	const { recurringActive } = billingContextToRecurringAndScheduled({
		billingContext,
	});
	const preservedAddOnIds = [
		...new Set(
			recurringActive.filter(isCustomerProductAddOn).map(({ id }) => id),
		),
	];

	return phases.map((phase) => ({
		...phase,
		customerProductIds: [
			...new Set([...phase.customerProductIds, ...preservedAddOnIds]),
		],
	}));
};
