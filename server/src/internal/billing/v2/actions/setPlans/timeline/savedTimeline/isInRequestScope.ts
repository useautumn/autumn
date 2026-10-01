/**
 * Only rows on the targeted subscription and in a scope the request names enter
 * the timeline; everything else is never ended, re-timed or shown.
 */
export const isInRequestScope = ({
	customerProductId,
	internalEntityId,
	stripeScopeCustomerProductIds,
	representedScopes,
}: {
	customerProductId: string;
	internalEntityId: string | null;
	/** Absent when the request targets no subscription, so every subscription is in scope. */
	stripeScopeCustomerProductIds?: Set<string>;
	representedScopes: Set<string | null>;
}) =>
	(stripeScopeCustomerProductIds === undefined ||
		stripeScopeCustomerProductIds.has(customerProductId)) &&
	representedScopes.has(internalEntityId);
