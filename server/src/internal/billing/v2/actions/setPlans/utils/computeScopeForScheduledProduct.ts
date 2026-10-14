import type {
	Entity,
	FullCustomer,
	FullProduct,
	MultiAttachProductContext,
} from "@autumn/shared";
import { productToReplacementKey, RecaseError } from "@autumn/shared";
import { resolvePhaseProductContexts } from "./unscheduledProductContexts";

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

const inheritScopeFromImmediatePhase = ({
	immediatePhaseProductContexts,
	fullProduct,
	fallbackEntity,
}: {
	immediatePhaseProductContexts: MultiAttachProductContext[];
	fullProduct: FullProduct;
	fallbackEntity?: Entity;
}): Entity | undefined => {
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
