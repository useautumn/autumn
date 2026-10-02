import type {
	MultiAttachBillingContext,
	MultiAttachProductContext,
} from "@autumn/shared";

/**
 * phaseToImmediateParams attaches the unscheduled plans after the phase's own,
 * so they land last in productContexts. Mark them once here — everything
 * downstream reads the flag instead of re-deriving the boundary.
 */
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

/** Plans billed with the immediate phase that the schedule never ends or replaces. */
export const resolveUnscheduledProductContexts = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}): MultiAttachProductContext[] =>
	productContexts.filter((productContext) => productContext.unscheduled);

/** The immediate phase's own plans — the ones the schedule manages. */
export const resolvePhaseProductContexts = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}): MultiAttachProductContext[] =>
	productContexts.filter((productContext) => !productContext.unscheduled);
