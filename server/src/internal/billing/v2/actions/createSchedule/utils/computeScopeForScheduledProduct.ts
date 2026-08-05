import type {
	Entity,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import { productToReplacementKey } from "@autumn/shared";
import { resolvePhaseProductContexts } from "./unscheduledProductContexts";

/**
 * The entity a later-phase plan is attached in. A schedule can't change scope
 * mid-flight, so later phases never declare their own — each plan takes the
 * scope of the immediate-phase plan it succeeds: the same product if one is
 * there, otherwise whichever plan holds the same group.
 *
 * A match with no entity means customer-level, so the fallback applies only
 * when the immediate phase has no matching plan at all.
 */
export const computeScopeForScheduledProduct = ({
	immediatePhaseProductContexts,
	fullProduct,
	fallbackEntity,
}: {
	immediatePhaseProductContexts: MultiAttachProductContext[];
	fullProduct: FullProduct;
	fallbackEntity?: Entity;
}): Entity | undefined => {
	// Unscheduled plans outlive the schedule, so a later phase must never adopt
	// one's entity — they are excluded here rather than trusted to the caller.
	const scheduledPlans = resolvePhaseProductContexts({
		productContexts: immediatePhaseProductContexts,
	});
	const replacementKey = productToReplacementKey({ product: fullProduct });

	const precedingPlan =
		scheduledPlans.find(
			(productContext) => productContext.fullProduct.id === fullProduct.id,
		) ??
		scheduledPlans.find(
			(productContext) =>
				productToReplacementKey({ product: productContext.fullProduct }) ===
				replacementKey,
		);

	if (!precedingPlan) return fallbackEntity;
	return precedingPlan.fullCustomer.entity;
};
