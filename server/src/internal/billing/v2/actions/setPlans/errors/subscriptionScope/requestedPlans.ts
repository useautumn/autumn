import type { CreateScheduleBillingContext, FullProduct } from "@autumn/shared";

export type RequestedPlan = {
	fullProduct: FullProduct;
	internalEntityId?: string;
};

export const requestedPlans = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"productContexts" | "scheduledPhaseContexts"
	>;
}): RequestedPlan[] => [
	...billingContext.productContexts.map(({ fullProduct, fullCustomer }) => ({
		fullProduct,
		internalEntityId: fullCustomer.entity?.internal_id,
	})),
	...billingContext.scheduledPhaseContexts.flatMap(({ productContexts }) =>
		productContexts.map(({ fullProduct, entity }) => ({
			fullProduct,
			internalEntityId: entity?.internal_id,
		})),
	),
];
