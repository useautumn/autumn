import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import {
	customerProductsToRecurringActiveAndScheduled,
	customerProductToReplacementKey,
	isCusProductOnEntity,
	productToReplacementKey,
} from "@autumn/shared";

type PhasePlan = { fullProduct: FullProduct; internalEntityId?: string };

type RecurringProductFate =
	| { kind: "endsNow" }
	| { kind: "endsAtPhase"; endsAt: number }
	| { kind: "untouched" };

/** An incoming plan replaces a product when it claims the same group and scope. */
const plansReplaceCustomerProduct = ({
	plans,
	customerProduct,
}: {
	plans: PhasePlan[];
	customerProduct: FullCusProduct;
}) => {
	const replacementKey = customerProductToReplacementKey({ customerProduct });
	return plans.some(
		(plan) =>
			productToReplacementKey({ product: plan.fullProduct }) ===
				replacementKey &&
			isCusProductOnEntity({
				cusProduct: customerProduct,
				internalEntityId: plan.internalEntityId,
			}),
	);
};

/** Products in the request's scopes, plus everything the replaced schedule placed. */
const collectCandidateCustomerProducts = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}): FullCusProduct[] => {
	const candidatesById = new Map<string, FullCusProduct>();

	for (const { fullCustomer } of billingContext.productContexts) {
		for (const customerProduct of fullCustomer.customer_products) {
			const inScope = isCusProductOnEntity({
				cusProduct: customerProduct,
				internalEntityId: fullCustomer.entity?.internal_id,
			});
			if (inScope) candidatesById.set(customerProduct.id, customerProduct);
		}
	}

	const replacedCustomerProductIds = new Set(
		billingContext.replacedScheduleCustomerProductIds,
	);
	for (const customerProduct of billingContext.fullCustomer.customer_products) {
		if (replacedCustomerProductIds.has(customerProduct.id)) {
			candidatesById.set(customerProduct.id, customerProduct);
		}
	}

	return [...candidatesById.values()];
};

const resolveRecurringProductFate = ({
	customerProduct,
	openingPlans,
	laterPhases,
	replacedCustomerProductIds,
}: {
	customerProduct: FullCusProduct;
	openingPlans: PhasePlan[];
	laterPhases: { startsAt: number; plans: PhasePlan[] }[];
	replacedCustomerProductIds: Set<string>;
}): RecurringProductFate => {
	// The replaced schedule placed it, or the immediate phase claims its group and scope.
	if (
		replacedCustomerProductIds.has(customerProduct.id) ||
		plansReplaceCustomerProduct({ plans: openingPlans, customerProduct })
	) {
		return { kind: "endsNow" };
	}

	// A survivor ends when the first later phase claims its group, rather than
	// running alongside its own replacement.
	const supersedingPhase = laterPhases.find(({ plans }) =>
		plansReplaceCustomerProduct({ plans, customerProduct }),
	);
	if (supersedingPhase) {
		return { kind: "endsAtPhase", endsAt: supersedingPhase.startsAt };
	}

	return { kind: "untouched" };
};

export const resolveCreateScheduleRecurringProducts = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { recurringActive, recurringScheduled } =
		customerProductsToRecurringActiveAndScheduled({
			customerProducts: collectCandidateCustomerProducts({ billingContext }),
		});

	const openingPlans: PhasePlan[] = billingContext.productContexts.map(
		({ fullProduct, fullCustomer }) => ({
			fullProduct,
			internalEntityId: fullCustomer.entity?.internal_id,
		}),
	);
	const laterPhases = billingContext.scheduledPhaseContexts.map(
		({ startsAt, productContexts }) => ({
			startsAt,
			plans: productContexts.map(({ fullProduct, entity }) => ({
				fullProduct,
				internalEntityId: entity?.internal_id,
			})),
		}),
	);
	const replacedCustomerProductIds = new Set(
		billingContext.replacedScheduleCustomerProductIds,
	);

	const recurringOutgoing: FullCusProduct[] = [];
	const recurringEndingAtPhase: {
		customerProduct: FullCusProduct;
		endsAt: number;
	}[] = [];

	for (const customerProduct of recurringActive) {
		const fate = resolveRecurringProductFate({
			customerProduct,
			openingPlans,
			laterPhases,
			replacedCustomerProductIds,
		});
		if (fate.kind === "endsNow") recurringOutgoing.push(customerProduct);
		if (fate.kind === "endsAtPhase") {
			recurringEndingAtPhase.push({ customerProduct, endsAt: fate.endsAt });
		}
	}

	return {
		recurringActive,
		recurringScheduled,
		recurringOutgoing,
		recurringEndingAtPhase,
	};
};
