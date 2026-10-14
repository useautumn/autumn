export type RequestEntityScope = "allEntities" | Set<string | null>;

export const isInRequestScope = ({
	customerProductId,
	internalEntityId,
	stripeScopeCustomerProductIds,
	entityScope,
}: {
	customerProductId: string;
	internalEntityId: string | null;
	stripeScopeCustomerProductIds?: Set<string>;
	entityScope: RequestEntityScope;
}) =>
	(stripeScopeCustomerProductIds === undefined ||
		stripeScopeCustomerProductIds.has(customerProductId)) &&
	(entityScope === "allEntities" || entityScope.has(internalEntityId));
