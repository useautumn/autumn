import type {
	MultiAttachBillingContext,
	MultiAttachProductContext,
} from "@autumn/shared";

export const markUnscheduledProductContexts = ({
	billingContext,
	unscheduledPlanCount,
}: {
	billingContext: MultiAttachBillingContext;
	unscheduledPlanCount: number;
}): MultiAttachBillingContext => {
	const phasePlanCount =
		billingContext.productContexts.length - unscheduledPlanCount;

	return {
		...billingContext,
		productContexts: billingContext.productContexts.map(
			(productContext, index) => ({
				...productContext,
				unscheduled: index >= phasePlanCount,
			}),
		),
	};
};

export const resolveUnscheduledProductContexts = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}): MultiAttachProductContext[] =>
	productContexts.filter((productContext) => productContext.unscheduled);

export const resolvePhaseProductContexts = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}): MultiAttachProductContext[] =>
	productContexts.filter((productContext) => !productContext.unscheduled);
