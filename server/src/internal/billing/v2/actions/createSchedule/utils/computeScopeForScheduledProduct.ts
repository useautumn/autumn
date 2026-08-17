import type {
	Entity,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import { productToReplacementKey, RecaseError } from "@autumn/shared";
import { resolvePhaseProductContexts } from "./unscheduledProductContexts";

/**
 * The entity a later-phase plan is attached in. A plan that declares its own
 * entity_id takes it; the rest fall back to the scope of the immediate-phase
 * plan they succeed — the same product if one is there, otherwise whichever
 * plan holds the same group.
 *
 * A match with no entity means customer-level, so the fallback applies only
 * when the immediate phase has no matching plan at all.
 */
export const computeScopeForScheduledProduct = ({
	immediatePhaseProductContexts,
	fullProduct,
	entityId,
	fallbackEntity,
}: {
	immediatePhaseProductContexts: MultiAttachProductContext[];
	fullProduct: FullProduct;
	entityId?: string | null;
	fallbackEntity?: Entity;
}): Entity | undefined => {
	// Unscheduled plans outlive the schedule, so a later phase must never adopt
	// one's entity — they are excluded here rather than trusted to the caller.
	const scheduledPlans = resolvePhaseProductContexts({
		productContexts: immediatePhaseProductContexts,
	});

	if (entityId !== undefined) {
		return entityId === null
			? undefined
			: findImmediatePhaseEntity({ scheduledPlans, entityId });
	}

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

/** A schedule can't change scope mid-flight, so the entity must already be there. */
const findImmediatePhaseEntity = ({
	scheduledPlans,
	entityId,
}: {
	scheduledPlans: MultiAttachProductContext[];
	entityId: string;
}): Entity => {
	const entity = scheduledPlans.find(
		(productContext) => productContext.fullCustomer.entity?.id === entityId,
	)?.fullCustomer.entity;

	if (!entity) {
		throw new RecaseError({
			message: `Entity '${entityId}' is not scoped by the first phase, so a later phase cannot schedule a plan in it.`,
			statusCode: 400,
		});
	}

	return entity;
};
