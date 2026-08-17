import type {
	Entity,
	FullCustomer,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import { productToReplacementKey, RecaseError } from "@autumn/shared";
import { resolvePhaseProductContexts } from "./unscheduledProductContexts";

/**
 * The entity a later-phase plan is attached in: the one it states, else the
 * scope of the immediate-phase plan it succeeds — the same product if one is
 * there, otherwise whichever plan holds the same group.
 */
export const computeScopeForScheduledProduct = ({
	immediatePhaseProductContexts,
	fullProduct,
	entityId,
	fullCustomer,
	fallbackEntity,
}: {
	immediatePhaseProductContexts: MultiAttachProductContext[];
	fullProduct: FullProduct;
	entityId?: string | null;
	fullCustomer: FullCustomer;
	fallbackEntity?: Entity;
}): Entity | undefined => {
	if (entityId === null) return undefined;
	if (entityId !== undefined) {
		return findCustomerEntity({ fullCustomer, entityId });
	}

	return inheritScopeFromImmediatePhase({
		immediatePhaseProductContexts,
		fullProduct,
		fallbackEntity,
	});
};

const findCustomerEntity = ({
	fullCustomer,
	entityId,
}: {
	fullCustomer: FullCustomer;
	entityId: string;
}): Entity => {
	const entity = fullCustomer.entities.find(
		(candidate) => candidate.id === entityId,
	);

	if (!entity) {
		throw new RecaseError({
			message: `Entity '${entityId}' not found for customer '${fullCustomer.id}'`,
			statusCode: 400,
		});
	}

	return entity;
};

/** A match with no entity means customer-level, so the fallback applies only
 * when the immediate phase has no matching plan at all. */
const inheritScopeFromImmediatePhase = ({
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
