/** Every entity, or only the listed scopes (null is the customer level). */
export type RequestEntityScope = "allEntities" | Set<string | null>;

/**
 * Only rows on the targeted subscription and in the request's entity scope enter
 * the timeline; everything else is never ended, re-timed or shown.
 */
export const isInRequestScope = ({
	customerProductId,
	internalEntityId,
	stripeScopeCustomerProductIds,
	entityScope,
}: {
	customerProductId: string;
	internalEntityId: string | null;
	/** Absent when the request targets no subscription, so every subscription is in scope. */
	stripeScopeCustomerProductIds?: Set<string>;
	entityScope: RequestEntityScope;
}) =>
	(stripeScopeCustomerProductIds === undefined ||
		stripeScopeCustomerProductIds.has(customerProductId)) &&
	(entityScope === "allEntities" || entityScope.has(internalEntityId));
