import type { FullCustomer, SyncProductContext } from "@autumn/shared";
import { findLinkedPlanInstances } from "./findLinkedPlanInstances";

/**
 * A plan with quantity N becomes N product contexts, one cusProduct per
 * instance. Each replaces at most one existing instance, so a re-sync converges.
 */
export const expandToPlanInstances = ({
	fullCustomer,
	productContext,
	stripeSubscriptionId,
}: {
	fullCustomer: FullCustomer;
	productContext: SyncProductContext;
	stripeSubscriptionId?: string;
}): SyncProductContext[] => {
	const requested = productContext.plan.quantity ?? 1;
	const replacesExisting =
		stripeSubscriptionId !== undefined &&
		productContext.plan.expire_previous === true;
	const otherInstances = replacesExisting
		? findLinkedPlanInstances({
				fullCustomer,
				fullProduct: productContext.fullProduct,
				stripeSubscriptionId,
				internalEntityId: productContext.entity?.internal_id,
			}).filter(
				(instance) => instance.id !== productContext.currentCustomerProduct?.id,
			)
		: [];

	return Array.from({ length: requested }, (_, index) =>
		index === 0
			? productContext
			: {
					...productContext,
					currentCustomerProduct: otherInstances[index - 1],
				},
	);
};
