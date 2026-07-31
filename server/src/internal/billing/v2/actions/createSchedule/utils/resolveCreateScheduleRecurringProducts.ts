import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import {
	customerProductsToRecurringActiveAndScheduled,
	isCusProductOnEntity,
	isCustomerProductMain,
} from "@autumn/shared";

type ProductScope = {
	isAddOn: boolean;
	internalEntityId?: string;
};

const isReplacedInPhase = ({
	productScopes,
	customerProduct,
}: {
	productScopes: ProductScope[];
	customerProduct: FullCusProduct;
}) =>
	isCustomerProductMain(customerProduct) &&
	productScopes.some(
		({ isAddOn, internalEntityId }) =>
			!isAddOn &&
			isCusProductOnEntity({
				cusProduct: customerProduct,
				internalEntityId,
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

	const { recurringActive, recurringScheduled } =
		customerProductsToRecurringActiveAndScheduled({
			customerProducts: [...customerProductsById.values()],
		});
	const recurringOutgoing: FullCusProduct[] = [];
	const recurringPreserved: FullCusProduct[] = [];
	// Multi-phase schedules use the request scope; per-plan scopes are immediate-only.
	const scheduledInternalEntityId =
		billingContext.fullCustomer.entity?.internal_id;
	const phaseProductScopes: ProductScope[][] = [
		billingContext.productContexts.map(({ fullCustomer, fullProduct }) => ({
			isAddOn: fullProduct.is_add_on,
			internalEntityId: fullCustomer.entity?.internal_id,
		})),
		...billingContext.scheduledPhaseContexts.map(({ productContexts }) =>
			productContexts.map(({ fullProduct }) => ({
				isAddOn: fullProduct.is_add_on,
				internalEntityId: scheduledInternalEntityId,
			})),
		),
	];

	for (const customerProduct of recurringActive) {
		const isOutgoing =
			!billingContext.preserveAddOns ||
			isReplacedInPhase({
				productScopes: phaseProductScopes[0] ?? [],
				customerProduct,
			});
		if (isOutgoing) recurringOutgoing.push(customerProduct);
		else recurringPreserved.push(customerProduct);
	}

	return {
		recurringActive,
		recurringScheduled,
		recurringOutgoing,
		preservedCustomerProductIdsByPhase: phaseProductScopes.map(
			(productScopes) =>
				recurringPreserved
					.filter(
						(customerProduct) =>
							!isReplacedInPhase({ productScopes, customerProduct }),
					)
					.map(({ id }) => id),
		),
	};
};

export const addCustomerProductIdsToSchedulePhases = ({
	phases,
	customerProductIdsByPhase,
}: {
	phases: { startsAt: number; customerProductIds: string[] }[];
	customerProductIdsByPhase: string[][];
}) =>
	phases.map((phase, index) => ({
		...phase,
		customerProductIds: [
			...new Set([
				...phase.customerProductIds,
				...(customerProductIdsByPhase[index] ?? []),
			]),
		],
	}));
