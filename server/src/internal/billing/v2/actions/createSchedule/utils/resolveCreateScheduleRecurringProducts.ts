import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import {
	customerProductsToRecurringActiveAndScheduled,
	isCusProductOnEntity,
} from "@autumn/shared";

type ProductScope = {
	/** Add-ons stack rather than replace, so they key on their own id. */
	replacementKey: string;
	internalEntityId?: string;
};

const replacementKey = ({
	product,
}: {
	product: { id: string; group: string | null; is_add_on: boolean };
}) => (product.is_add_on ? product.id : (product.group ?? ""));

const toProductScope = ({
	fullProduct,
	internalEntityId,
}: {
	fullProduct: { id: string; group: string | null; is_add_on: boolean };
	internalEntityId?: string;
}): ProductScope => ({
	replacementKey: replacementKey({ product: fullProduct }),
	internalEntityId,
});

/** A plan is superseded only by an incoming plan for the same slot in the same scope. */
const isSupersededInPhase = ({
	productScopes,
	customerProduct,
}: {
	productScopes: ProductScope[];
	customerProduct: FullCusProduct;
}) =>
	productScopes.some(
		(scope) =>
			scope.replacementKey === replacementKey(customerProduct) &&
			isCusProductOnEntity({
				cusProduct: customerProduct,
				internalEntityId: scope.internalEntityId,
			}),
	);

export const resolveCreateScheduleRecurringProducts = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const customerProductsById = new Map<string, FullCusProduct>();

	for (const productContext of billingContext.productContexts) {
		const { entity, customer_products: customerProducts } =
			productContext.fullCustomer;
		for (const customerProduct of customerProducts) {
			if (
				isCusProductOnEntity({
					cusProduct: customerProduct,
					internalEntityId: entity?.internal_id,
				})
			) {
				customerProductsById.set(customerProduct.id, customerProduct);
			}
		}
	}

	// Products the replaced schedule put in place, so one the new phases drop is
	// expired instead of left behind.
	const replacedCustomerProductIds = new Set(
		billingContext.replacedScheduleCustomerProductIds,
	);
	for (const customerProduct of billingContext.fullCustomer.customer_products) {
		if (replacedCustomerProductIds.has(customerProduct.id)) {
			customerProductsById.set(customerProduct.id, customerProduct);
		}
	}

	const { recurringActive, recurringScheduled } =
		customerProductsToRecurringActiveAndScheduled({
			customerProducts: [...customerProductsById.values()],
		});
	const openingPhaseScopes = billingContext.productContexts.map(
		({ fullCustomer, fullProduct }) =>
			toProductScope({
				fullProduct,
				internalEntityId: fullCustomer.entity?.internal_id,
			}),
	);

	// Anything this schedule never placed and isn't taking over stays untouched.
	const recurringOutgoing = recurringActive.filter(
		(customerProduct) =>
			replacedCustomerProductIds.has(customerProduct.id) ||
			isSupersededInPhase({
				productScopes: openingPhaseScopes,
				customerProduct,
			}),
	);

	// A survivor whose slot a later phase claims ends when that phase starts,
	// rather than running alongside its own replacement.
	const recurringEndingAtPhase = recurringActive.flatMap((customerProduct) => {
		if (recurringOutgoing.includes(customerProduct)) return [];

		const supersedingPhase = billingContext.scheduledPhaseContexts.find(
			({ productContexts }) =>
				isSupersededInPhase({
					productScopes: productContexts.map(({ fullProduct, entity }) =>
						toProductScope({
							fullProduct,
							internalEntityId: entity?.internal_id,
						}),
					),
					customerProduct,
				}),
		);
		if (!supersedingPhase) return [];

		return [{ customerProduct, endsAt: supersedingPhase.startsAt }];
	});

	return {
		recurringActive,
		recurringScheduled,
		recurringOutgoing,
		recurringEndingAtPhase,
	};
};
